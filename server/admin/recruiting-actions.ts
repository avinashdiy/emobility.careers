"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth, hashPassword } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { embeddingsQueue } from "@/lib/queues";
import { sanitizeJobHtml, plainTextLength } from "@/lib/cms/job-sanitize";
import { optionalUrl } from "@/lib/forms/zod-url";
import {
  CompanyType,
  CompanyVerification,
  CompanyTeamRole,
  EmploymentType,
  JobAudience,
  JobStatus,
  ProfileMode,
  Role,
  SalaryPeriod,
  SeniorityLevel,
  WorkMode,
} from "@prisma/client";

/**
 * Admin-side recruiting tooling. Two big workflows:
 *
 *   1. adminCreateJob — post a job on behalf of any company. The
 *      company can be one that already exists (just pick its id) or a
 *      brand-new one created inline. Lets the platform team grow the
 *      job-board catalogue without waiting for the employer to sign up.
 *
 *   2. adminProvisionHr — create a User account with role=EMPLOYER
 *      and an EmployerProfile linking them to a company. A provisional
 *      password is set so admin can hand the credentials to the HR /
 *      hiring manager via the channel of their choice (email, Slack,
 *      WhatsApp). The HR then signs in and reviews applicants /
 *      shortlists candidates from the existing /employer console.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

// ─── Job posting on behalf of a company ─────────────────────

// `looseUrl` is now an alias for the shared `optionalUrl` helper —
// same trim + auto-https-prefix behaviour, consistent across every
// candidate / employer / admin surface so a URL accepted in one
// form is also accepted in another.
const looseUrl = optionalUrl;

const looseEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email().or(z.literal("")));

const adminJobSchema = z.object({
  // Either pick an existing company OR fill in name+type to create one.
  companyId: z.string().optional(),
  newCompanyName: z.string().max(120).optional(),
  newCompanyWebsite: looseUrl.optional(),
  // NB the `.optional()` lives INSIDE the preprocess wrap. The HTML
  // form always submits this field (the <NativeSelect> exists on the
  // page even when the inline new-company <details> is collapsed),
  // so the raw value is `""`, not `undefined`. We turn the empty
  // string into `undefined` first, then let the enum accept the
  // undefined via its own `.optional()`. The old `.preprocess(...).optional()`
  // chain failed in the opposite direction — preprocess returned
  // undefined, but the enum (without its own optional) refused.
  newCompanyType: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.nativeEnum(CompanyType).optional(),
  ),
  newCompanyHqLocation: z.string().max(120).optional(),

  title: z.string().min(3).max(140),
  // Description is rich-text HTML coming from the RichTextEditor.
  // The min(20) refers to HTML *length* — the plain-text length
  // gate runs separately below so 20 chars of `<p></p>` markup
  // doesn't pass as a real body. Both gates fire so we get a
  // friendly per-field error.
  // Just "non-empty" at the Zod layer; the plain-text length gate
  // below is the real "≥ 20 readable characters" check. See
  // server/employer/actions.ts for the same change + rationale.
  description: z.string().min(1, "Description is required."),
  responsibilities: z.string().optional(),
  requirements: z.string().optional(),
  benefits: z.string().optional(),
  profileMode: z.nativeEnum(ProfileMode).default(ProfileMode.EXPERIENCED),
  employmentType: z.nativeEnum(EmploymentType).default(EmploymentType.FULL_TIME),
  workMode: z.nativeEnum(WorkMode).default(WorkMode.ONSITE),
  seniorityLevel: z.nativeEnum(SeniorityLevel).default(SeniorityLevel.MID),
  locations: z.string().optional(),
  experienceMin: z.coerce.number().int().min(0).optional(),
  experienceMax: z.coerce.number().int().min(0).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  salaryPeriod: z.nativeEnum(SalaryPeriod).default(SalaryPeriod.YEARLY),
  salaryHidden: z.coerce.boolean().optional(),
  audience: z.nativeEnum(JobAudience).default(JobAudience.PUBLIC),
  publishNow: z.coerce.boolean().optional(),

  // External-apply URL. When set, the public job page short-circuits
  // the internal apply form and links the candidate straight out to
  // the employer's career page.
  applicationUrl: looseUrl.optional(),
  applicationEmail: looseEmail.optional(),

  evDomainSlugs: z.string().optional(),
  skillNames: z.string().optional(),
});

export interface AdminJobFormState {
  ok: boolean;
  message?: string;
  /// Per-field validation errors keyed by form field name. Surfaced
  /// inline in the form via FieldError components so the admin can
  /// see exactly which field rejected and why.
  fieldErrors?: Record<string, string>;
  /// Echo of every submitted value so the form can re-mount with the
  /// admin's previous typing instead of nuking everything. Stored as
  /// plain strings (FormData round-trip) so we don't have to re-type
  /// the schema for every render.
  prevValues?: Record<string, string>;
}

const initialAdminJobState: AdminJobFormState = { ok: false };

/** Helper — turn the submitted FormData into a plain string map. */
function snapshotForm(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function adminCreateJob(
  _prev: AdminJobFormState,
  formData: FormData,
): Promise<AdminJobFormState> {
  const session = await requireAdmin();
  const parsed = adminJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat.fieldErrors)) {
      if (v && v[0]) fieldErrors[k] = v[0];
    }
    logger.warn(
      { errors: flat },
      "[adminCreateJob] validation failed",
    );
    // Friendly headline message — first-failing field, plus a hint
    // when a URL field is the culprit (most common admin mistake).
    const firstField = Object.keys(fieldErrors)[0];
    const hint =
      firstField === "applicationUrl" ||
      firstField === "newCompanyWebsite"
        ? " (URLs need to be valid — e.g. https://company.com/careers)"
        : firstField === "description"
          ? " — description can't be empty"
          : "";
    return {
      ok: false,
      message:
        firstField !== undefined
          ? `Couldn't save: "${firstField}" failed validation${hint}.`
          : "Couldn't save. Check the highlighted fields.",
      fieldErrors,
      prevValues: snapshotForm(formData),
    };
  }
  const data = parsed.data;

  // ── Rich-text fields: sanitise + plain-text length gate ──
  // The four body fields come from the RichTextEditor as HTML. We
  // sanitise to the job-content allowlist (bold/italic/lists/links
  // — see lib/cms/job-sanitize.ts) and then verify the actual
  // human-readable content meets the minimum length. Without the
  // second gate a paste of `<p></p><p></p>` would slide past Zod's
  // .min(20) on the HTML string itself.
  const descriptionHtml = sanitizeJobHtml(data.description);
  const responsibilitiesHtml = sanitizeJobHtml(data.responsibilities);
  const requirementsHtml = sanitizeJobHtml(data.requirements);
  const benefitsHtml = sanitizeJobHtml(data.benefits);
  if (plainTextLength(descriptionHtml) < 20) {
    return {
      ok: false,
      message:
        "Description is too short. After formatting is removed, it needs at least 20 readable characters.",
      fieldErrors: { description: "Add at least 20 characters of body text." },
      prevValues: snapshotForm(formData),
    };
  }

  // Resolve the company first. If `companyId` is provided we use it
  // verbatim (caller picked from the dropdown). Otherwise we create a
  // brand-new company with the provided name/type.
  let companyId = data.companyId?.trim() || null;
  let createdCompanyId: string | null = null;
  if (!companyId) {
    if (!data.newCompanyName || !data.newCompanyType) {
      return {
        ok: false,
        message:
          "Pick an existing company from the dropdown, or open the inline section and fill name + type.",
        fieldErrors: {
          ...(!data.newCompanyName ? { newCompanyName: "Required when creating a new company." } : {}),
          ...(!data.newCompanyType ? { newCompanyType: "Required when creating a new company." } : {}),
        },
        prevValues: snapshotForm(formData),
      };
    }
    const created = await withUniqueSlug(data.newCompanyName, (slug) =>
      db.company.create({
        data: {
          slug,
          name: data.newCompanyName!,
          companyType: data.newCompanyType!,
          website: data.newCompanyWebsite || null,
          hqLocation: data.newCompanyHqLocation || null,
          ownerUserId: session.user.id,
          // Admin-posted companies skip the verification queue — the
          // platform team has just vouched for them.
          verificationStatus: CompanyVerification.VERIFIED,
        },
        select: { id: true, slug: true, name: true },
      }),
    );
    companyId = created.id;
    createdCompanyId = created.id;
    await audit({
      actorId: session.user.id,
      action: "company.admin_created",
      entity: "Company",
      entityId: created.id,
      meta: { name: created.name, source: "admin_job_post" },
    });
  } else {
    // Sanity-check the picked company exists.
    const exists = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, slug: true },
    });
    if (!exists) {
      return {
        ok: false,
        message: "Selected company no longer exists. Pick another or create one inline.",
        fieldErrors: { companyId: "Company not found in directory." },
        prevValues: snapshotForm(formData),
      };
    }
  }

  const company = await db.company.findUnique({
    where: { id: companyId! },
    select: { slug: true, name: true },
  });
  if (!company) {
    return {
      ok: false,
      message: "Company resolution failed — please retry.",
      prevValues: snapshotForm(formData),
    };
  }

  const locations = data.locations
    ? data.locations.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // DIYGURU_ONLY listings always show salary — same rule the employer
  // path enforces; the audience expects a level playing field.
  const salaryHidden =
    data.audience === JobAudience.DIYGURU_ONLY ? false : Boolean(data.salaryHidden);

  const job = await db.$transaction(
    async (tx) => {
      const created = await withUniqueSlug(`${data.title}-${company.slug}`, (slug) =>
        tx.jobPosting.create({
          data: {
            slug,
            companyId: companyId!,
            postedById: session.user.id,
            title: data.title,
            description: descriptionHtml,
            responsibilities: responsibilitiesHtml || null,
            requirements: requirementsHtml || null,
            benefits: benefitsHtml || null,
            profileMode: data.profileMode,
            employmentType: data.employmentType,
            workMode: data.workMode,
            seniorityLevel: data.seniorityLevel,
            locations,
            experienceMin: data.experienceMin ?? null,
            experienceMax: data.experienceMax ?? null,
            salaryMin: data.salaryMin ? new Prisma.Decimal(data.salaryMin) : null,
            salaryMax: data.salaryMax ? new Prisma.Decimal(data.salaryMax) : null,
            salaryCurrency: "INR",
            salaryPeriod: data.salaryPeriod,
            salaryHidden,
            audience: data.audience,
            applicationUrl: data.applicationUrl || null,
            applicationEmail: data.applicationEmail || null,
            status: data.publishNow ? JobStatus.OPEN : JobStatus.DRAFT,
            publishedAt: data.publishNow ? new Date() : null,
          },
        }),
      );

      if (data.evDomainSlugs) {
        const slugs = data.evDomainSlugs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (slugs.length > 0) {
          const domains = await tx.eVDomain.findMany({
            where: { slug: { in: slugs } },
            select: { id: true },
          });
          if (domains.length > 0) {
            await tx.jobEVDomain.createMany({
              data: domains.map((d) => ({ jobId: created.id, evDomainId: d.id })),
              skipDuplicates: true,
            });
          }
        }
      }

      if (data.skillNames) {
        const names = data.skillNames
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length > 0) {
          const skills = await Promise.all(
            names.map((name) => {
              const slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
              return tx.skill.upsert({
                where: { slug },
                create: { slug, name, category: "Imported" },
                update: {},
                select: { id: true },
              });
            }),
          );
          await tx.jobSkill.createMany({
            data: skills.map((s) => ({
              jobId: created.id,
              skillId: s.id,
              required: true,
            })),
            skipDuplicates: true,
          });
        }
      }

      return created;
    },
    { timeout: 15_000 },
  );

  await audit({
    actorId: session.user.id,
    action: "job.admin_posted",
    entity: "JobPosting",
    entityId: job.id,
    meta: {
      companyId,
      companyCreated: createdCompanyId === companyId,
      external: !!data.applicationUrl,
      published: !!data.publishNow,
    },
  });

  await embeddingsQueue.add("job", { kind: "job", jobId: job.id });

  revalidatePath("/admin/jobs");
  revalidatePath("/jobs");
  redirect(
    "/admin/jobs?notice=" +
      encodeURIComponent(
        `✅ Posted "${job.title}" for ${company.name}${data.publishNow ? " (live)" : " (draft)"}.`,
      ),
  );
}

// ─── Admin: edit an existing job posting ──────────────────────

/**
 * Companion to `adminCreateJob`. Drives the /admin/jobs/[id]/edit
 * page — same form, same shape, same useActionState contract.
 *
 *   • `jobId` is supplied via a hidden input in the form.
 *   • The company is locked: changing the parent company of an
 *     existing posting is out of scope (it'd invalidate every
 *     existing application's audit trail).
 *   • Status + publishedAt are NOT touched here — those live on
 *     the job-moderation list's Pause / Close / Open controls.
 *     Otherwise an inadvertent edit could un-publish a live job.
 *   • Embedding refresh is fire-and-forget so a stale match-score
 *     gets recomputed after the edit lands.
 */
const adminUpdateJobSchema = adminJobSchema.extend({
  jobId: z.string().min(1),
});

export async function adminUpdateJob(
  _prev: AdminJobFormState,
  formData: FormData,
): Promise<AdminJobFormState> {
  const session = await requireAdmin();
  const parsed = adminUpdateJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fieldErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(flat.fieldErrors)) {
      if (v && v[0]) fieldErrors[k] = v[0];
    }
    logger.warn({ errors: flat }, "[adminUpdateJob] validation failed");
    const firstField = Object.keys(fieldErrors)[0];
    return {
      ok: false,
      message:
        firstField !== undefined
          ? `Couldn't save: "${firstField}" failed validation.`
          : "Couldn't save. Check the highlighted fields.",
      fieldErrors,
      prevValues: snapshotForm(formData),
    };
  }
  const data = parsed.data;

  const existing = await db.jobPosting.findUnique({
    where: { id: data.jobId },
    select: { id: true, slug: true, companyId: true },
  });
  if (!existing) {
    return {
      ok: false,
      message: "That job no longer exists — refresh the moderation list.",
      prevValues: snapshotForm(formData),
    };
  }

  const descriptionHtml = sanitizeJobHtml(data.description);
  const responsibilitiesHtml = sanitizeJobHtml(data.responsibilities);
  const requirementsHtml = sanitizeJobHtml(data.requirements);
  const benefitsHtml = sanitizeJobHtml(data.benefits);
  if (plainTextLength(descriptionHtml) < 20) {
    return {
      ok: false,
      message:
        "Description is too short. After formatting is removed, it needs at least 20 readable characters.",
      fieldErrors: { description: "Add at least 20 characters of body text." },
      prevValues: snapshotForm(formData),
    };
  }

  const locations = data.locations
    ? data.locations.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const salaryHidden =
    data.audience === JobAudience.DIYGURU_ONLY ? false : Boolean(data.salaryHidden);

  await db.$transaction(async (tx) => {
    await tx.jobPosting.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: descriptionHtml,
        responsibilities: responsibilitiesHtml || null,
        requirements: requirementsHtml || null,
        benefits: benefitsHtml || null,
        profileMode: data.profileMode,
        employmentType: data.employmentType,
        workMode: data.workMode,
        seniorityLevel: data.seniorityLevel,
        locations,
        experienceMin: data.experienceMin ?? null,
        experienceMax: data.experienceMax ?? null,
        salaryMin: data.salaryMin ? new Prisma.Decimal(data.salaryMin) : null,
        salaryMax: data.salaryMax ? new Prisma.Decimal(data.salaryMax) : null,
        salaryPeriod: data.salaryPeriod,
        salaryHidden,
        audience: data.audience,
        applicationUrl: data.applicationUrl || null,
        applicationEmail: data.applicationEmail || null,
        // Status / publishedAt deliberately NOT changed here — see fn docstring.
      },
    });

    // Tags get the simple replace-the-set treatment. Cheaper to
    // delete + re-insert than diff each side; the join tables are
    // small per-job.
    if (data.evDomainSlugs !== undefined) {
      await tx.jobEVDomain.deleteMany({ where: { jobId: existing.id } });
      const slugs = (data.evDomainSlugs ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (slugs.length > 0) {
        const domains = await tx.eVDomain.findMany({
          where: { slug: { in: slugs } },
          select: { id: true },
        });
        if (domains.length > 0) {
          await tx.jobEVDomain.createMany({
            data: domains.map((d) => ({ jobId: existing.id, evDomainId: d.id })),
            skipDuplicates: true,
          });
        }
      }
    }
    if (data.skillNames !== undefined) {
      await tx.jobSkill.deleteMany({ where: { jobId: existing.id } });
      const names = (data.skillNames ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0) {
        const skills = await Promise.all(
          names.map((name) => {
            const slug = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "");
            return tx.skill.upsert({
              where: { slug },
              create: { slug, name, category: "Imported" },
              update: {},
              select: { id: true },
            });
          }),
        );
        await tx.jobSkill.createMany({
          data: skills.map((s) => ({ jobId: existing.id, skillId: s.id, required: true })),
          skipDuplicates: true,
        });
      }
    }
  }, { timeout: 15_000 });

  await audit({
    actorId: session.user.id,
    action: "job.admin_edited",
    entity: "JobPosting",
    entityId: existing.id,
  });

  // Refresh the job's embedding so match-score reflects the new
  // body. Fire-and-forget — a failed enqueue just means stale
  // scores until the next nightly refresh.
  void embeddingsQueue.add("job", { kind: "job", jobId: existing.id }).catch(() => {});

  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${existing.id}/edit`);
  revalidatePath("/jobs");
  revalidatePath(`/job/${existing.slug}`);
  redirect(
    "/admin/jobs?notice=" +
      encodeURIComponent(`✅ Updated "${data.title}".`),
  );
}

// ─── HR / employer account provisioning ─────────────────────

const hrSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(120),
  designation: z.string().max(120).optional(),
  // Either link to an existing company OR mint a new one inline,
  // mirroring the job-post form's flexibility.
  companyId: z.string().optional(),
  newCompanyName: z.string().max(120).optional(),
  newCompanyType: z.nativeEnum(CompanyType).optional(),
  newCompanyWebsite: optionalUrl,
  // Default to RECRUITER. Admin-tier within the company is a safer
  // explicit-opt-in: tick the box if you want this person to be able
  // to invite teammates / edit the company page.
  teamRole: z.nativeEnum(CompanyTeamRole).default(CompanyTeamRole.RECRUITER),
  isCompanyAdmin: z.coerce.boolean().optional(),
});

/**
 * Generate a friendly, share-safe provisional password. 14 chars,
 * upper + lower + digits — easy to read out over WhatsApp without
 * making it trivial to brute-force.
 */
function generateProvisionalPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) =>
    set[Math.floor(Math.random() * set.length)];
  // Ensure every class is present, then fill the rest.
  const must = [pick(upper), pick(lower), pick(digits), pick(digits)];
  while (must.length < 14) must.push(pick(all));
  // Fisher-Yates shuffle so the must-have chars aren't always at the
  // start of the string.
  for (let i = must.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [must[i], must[j]] = [must[j], must[i]];
  }
  return must.join("");
}

export async function adminProvisionHr(formData: FormData) {
  const session = await requireAdmin();
  const parsed = hrSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.flatten() }, "[adminProvisionHr] validation failed");
    redirect(
      "/admin/employers/new?error=" + encodeURIComponent("Please fill required fields"),
    );
  }
  const data = parsed.data;
  const email = data.email.trim().toLowerCase();

  // Refuse if a user with this email already exists. Re-using would
  // overwrite their profile or surprise an existing candidate.
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    redirect(
      "/admin/employers/new?error=" +
        encodeURIComponent(
          `A user with ${email} already exists. Promote them via /admin/users instead.`,
        ),
    );
  }

  // Resolve company.
  let companyId = data.companyId?.trim() || null;
  if (!companyId) {
    if (!data.newCompanyName || !data.newCompanyType) {
      redirect(
        "/admin/employers/new?error=" +
          encodeURIComponent(
            "Pick an existing company or fill in name + type for a new one.",
          ),
      );
    }
    const created = await withUniqueSlug(data.newCompanyName, (slug) =>
      db.company.create({
        data: {
          slug,
          name: data.newCompanyName!,
          companyType: data.newCompanyType!,
          website: data.newCompanyWebsite || null,
          ownerUserId: session.user.id,
          verificationStatus: CompanyVerification.VERIFIED,
        },
        select: { id: true, name: true },
      }),
    );
    companyId = created.id;
    await audit({
      actorId: session.user.id,
      action: "company.admin_created",
      entity: "Company",
      entityId: created.id,
      meta: { name: created.name, source: "admin_hr_provision" },
    });
  } else {
    const exists = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!exists) {
      redirect(
        "/admin/employers/new?error=" +
          encodeURIComponent("Selected company no longer exists."),
      );
    }
  }

  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await hashPassword(provisionalPassword);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        name: data.name,
        passwordHash,
        role: Role.EMPLOYER,
        // Pre-verify so the new HR can post jobs on day one without
        // bouncing through the email-verification flow. The admin has
        // already vetted them.
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    await tx.employerProfile.create({
      data: {
        userId: created.id,
        companyId: companyId!,
        designation: data.designation || null,
        teamRole: data.teamRole,
        isCompanyAdmin: Boolean(data.isCompanyAdmin),
      },
    });
    return created;
  });

  await audit({
    actorId: session.user.id,
    action: "employer.provisioned",
    entity: "User",
    entityId: user.id,
    meta: { email, companyId, teamRole: data.teamRole },
  });

  // Hand the credentials back via querystring so the admin can copy
  // and share them with the HR. The password is shown ONCE — we don't
  // store it in plaintext anywhere, so reload of the page won't
  // recover it. Admin can always re-provision (or trigger a reset)
  // if it gets lost.
  redirect(
    "/admin/employers/new?provisioned=" +
      encodeURIComponent(
        JSON.stringify({
          email,
          tempPassword: provisionalPassword,
          userId: user.id,
        }),
      ),
  );
}

/**
 * Admin-triggered password reset for an existing employer / HR. The
 * user keeps their account; the password is rotated to a fresh
 * 14-char string that the admin can hand back to them. Useful when
 * the HR forgets their initial provisional password before logging
 * in for the first time.
 */
const resetSchema = z.object({ userId: z.string() });
export async function adminResetEmployerPassword(formData: FormData) {
  const session = await requireAdmin();
  const { userId } = resetSchema.parse(Object.fromEntries(formData));
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!target) {
    redirect(
      "/admin/employers?error=" + encodeURIComponent("User not found."),
    );
  }
  if (target.role !== Role.EMPLOYER) {
    redirect(
      "/admin/employers?error=" +
        encodeURIComponent("Only employer accounts can be reset here."),
    );
  }
  const provisionalPassword = generateProvisionalPassword();
  const passwordHash = await hashPassword(provisionalPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
  });
  await audit({
    actorId: session.user.id,
    action: "employer.password_reset",
    entity: "User",
    entityId: userId,
  });
  redirect(
    "/admin/employers?provisioned=" +
      encodeURIComponent(
        JSON.stringify({
          email: target.email,
          tempPassword: provisionalPassword,
          userId,
        }),
      ),
  );
}
