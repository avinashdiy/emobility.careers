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
import {
  CompanyType,
  CompanyVerification,
  CompanyTeamRole,
  EmploymentType,
  JobAudience,
  JobStatus,
  ProfileMode,
  Role,
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

const adminJobSchema = z.object({
  // Either pick an existing company OR fill in name+type to create one.
  companyId: z.string().optional(),
  newCompanyName: z.string().max(120).optional(),
  newCompanyWebsite: z.string().url().optional().or(z.literal("")),
  newCompanyType: z.nativeEnum(CompanyType).optional(),
  newCompanyHqLocation: z.string().max(120).optional(),

  title: z.string().min(3).max(140),
  description: z.string().min(20),
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
  salaryHidden: z.coerce.boolean().optional(),
  audience: z.nativeEnum(JobAudience).default(JobAudience.PUBLIC),
  publishNow: z.coerce.boolean().optional(),

  // External-apply URL. When set, the public job page short-circuits
  // the internal apply form and links the candidate straight out to
  // the employer's career page. This is the right default for jobs
  // the platform team aggregates from third-party sources.
  applicationUrl: z.string().url().optional().or(z.literal("")),
  applicationEmail: z.string().email().optional().or(z.literal("")),

  evDomainSlugs: z.string().optional(),
  skillNames: z.string().optional(),
});

export async function adminCreateJob(formData: FormData) {
  const session = await requireAdmin();
  const parsed = adminJobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.flatten() }, "[adminCreateJob] validation failed");
    redirect(
      "/admin/jobs/new?error=" + encodeURIComponent("Please fill required fields"),
    );
  }
  const data = parsed.data;

  // Resolve the company first. If `companyId` is provided we use it
  // verbatim (caller picked from the dropdown). Otherwise we create a
  // brand-new company with the provided name/type.
  let companyId = data.companyId?.trim() || null;
  let createdCompanyId: string | null = null;
  if (!companyId) {
    if (!data.newCompanyName || !data.newCompanyType) {
      redirect(
        "/admin/jobs/new?error=" +
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
      redirect(
        "/admin/jobs/new?error=" +
          encodeURIComponent("Selected company no longer exists."),
      );
    }
  }

  const company = await db.company.findUnique({
    where: { id: companyId! },
    select: { slug: true, name: true },
  });
  if (!company) {
    redirect(
      "/admin/jobs/new?error=" + encodeURIComponent("Company resolution failed."),
    );
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
            description: data.description,
            responsibilities: data.responsibilities || null,
            requirements: data.requirements || null,
            benefits: data.benefits || null,
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
  newCompanyWebsite: z.string().url().optional().or(z.literal("")),
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
