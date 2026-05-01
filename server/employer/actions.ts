"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth, unstable_update } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { embeddingsQueue, notificationsQueue } from "@/lib/queues";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import {
  CompanyType,
  EmploymentType,
  WorkMode,
  SeniorityLevel,
  ProfileMode,
  JobStatus,
  JobAudience,
  CompanyTeamRole,
} from "@prisma/client";

/**
 * Strict employer gate. Only EMPLOYER or ADMIN roles pass. Used by
 * every employer-side mutation that isn't the onboarding flow itself
 * — most importantly job posting, ATS moves, and company edits.
 *
 * A CANDIDATE who somehow has an EmployerProfile (e.g. an admin added
 * them directly) is REJECTED here even though they're on the team
 * roster. The user's role must be promoted to EMPLOYER (which happens
 * automatically when they complete /employer/onboarding) before they
 * can mutate company data. This is the platform-admin's job
 * specifically asked for: "candidate associated with a page cannot
 * add a job — they need to be employer".
 */
async function requireEmployer() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  return session;
}

/**
 * Loose gate used ONLY by the onboarding flow (createCompany,
 * joinExistingCompany). CANDIDATEs are allowed through because the
 * action itself bumps their role to EMPLOYER on completion. Every
 * other employer action uses the strict `requireEmployer` above.
 */
async function requireEmployerOrCandidate() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (
    session.user.role !== "EMPLOYER" &&
    session.user.role !== "ADMIN" &&
    session.user.role !== "CANDIDATE"
  ) {
    redirect("/403");
  }
  return session;
}

async function requireEmployerWithCompany() {
  const session = await requireEmployer();
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true, user: { select: { emailVerifiedAt: true } } },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.user.emailVerifiedAt && session.user.role !== "ADMIN") {
    redirect("/employer?error=" + encodeURIComponent("Verify your email before posting jobs."));
  }
  return { session, employer };
}

// ─── Company onboarding ─────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2).max(120),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().max(280).optional(),
  about: z.string().max(4000).optional(),
  companyType: z.nativeEnum(CompanyType),
  teamSize: z.string().optional(),
  hqLocation: z.string().max(120).optional(),
  designation: z.string().min(1).max(120),
});

export async function createCompany(formData: FormData) {
  const session = await requireEmployerOrCandidate();
  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/employer/onboarding?error=" + encodeURIComponent("Invalid input"));
  }
  const { designation, ...companyData } = parsed.data;

  const company = await db.$transaction(async (tx) => {
    const created = await withUniqueSlug(companyData.name, (slug) =>
      tx.company.create({
        data: {
          ...companyData,
          website: companyData.website || null,
          slug,
          ownerUserId: session.user.id,
        },
      }),
    );
    await tx.employerProfile.create({
      data: {
        userId: session.user.id,
        companyId: created.id,
        designation,
        teamRole: CompanyTeamRole.ADMIN,
        isCompanyAdmin: true,
      },
    });
    // Promote a CANDIDATE-role user to EMPLOYER once they complete
    // onboarding. Existing EMPLOYERs / ADMINs are left alone.
    if (session.user.role === "CANDIDATE") {
      await tx.user.update({
        where: { id: session.user.id },
        data: { role: "EMPLOYER" },
      });
    }
    return created;
  });

  // Refresh the JWT so /employer/* routes stop 403'ing. Without this
  // the user's session keeps the sign-in-time role until next login.
  // unstable_update fires the JWT callback with `trigger: "update"`
  // (see lib/auth.config.ts) which re-stamps the token in-place.
  if (session.user.role === "CANDIDATE") {
    await unstable_update?.({ user: { role: "EMPLOYER" } }).catch(() => undefined);
  }

  await audit({
    actorId: session.user.id,
    action: "company.created",
    entity: "Company",
    entityId: company.id,
    meta: { name: company.name },
  });

  revalidatePath("/employer");
  redirect("/employer");
}

// ─── Join an existing company ───────────────────────────────
//
// LinkedIn-style: when an employer signs up and finds their company
// already exists on the platform, they don't fork a duplicate — they
// claim a recruiter seat at the existing company. Their EmployerProfile
// is created with `isCompanyAdmin: false` (only the company owner has
// admin), and a TeamInvite is recorded for the company admin to
// approve. Until approved, the employer can browse but not post jobs;
// the gate happens in `requireEmployerWithCompany` via the
// `verificationStatus` / `teamRole` flags on existing employer actions.

const joinCompanySchema = z.object({
  companyId: z.string().min(1),
  designation: z.string().min(1).max(120),
});

export async function joinExistingCompany(formData: FormData) {
  const session = await requireEmployerOrCandidate();
  const parsed = joinCompanySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/employer/onboarding?error=" + encodeURIComponent("Pick a company and tell us your designation."));
  }
  const { companyId, designation } = parsed.data;

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerUserId: true,
      verificationStatus: true,
    },
  });
  if (!company) {
    redirect("/employer/onboarding?error=" + encodeURIComponent("Company not found."));
  }

  // Auto-join is restricted to UNVERIFIED companies. Once a company
  // has been admin-vetted (PENDING / VERIFIED) we refuse self-attach
  // because it would let an attacker claim e.g. "Ola Electric" and
  // immediately post jobs as that company. Verified companies must
  // route through TeamInvite (the admin invites you) — handled on
  // the existing /employer/team page.
  if (company!.verificationStatus !== "UNVERIFIED") {
    redirect(
      "/employer/onboarding?error=" +
        encodeURIComponent(
          `${company!.name} is a verified company on eMobility Careers. Ask an existing admin there to invite you from their team page, or contact support@emobility.careers.`,
        ),
    );
  }

  // Refuse to attach if the user is already on that company's roster —
  // saves a unique-constraint error and lets us send a clearer message.
  const existing = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (existing) {
    if (existing.companyId === company!.id) {
      redirect("/employer");
    }
    redirect("/employer/onboarding?error=" + encodeURIComponent("You're already linked to a different company. Contact support to switch."));
  }

  await db.$transaction(async (tx) => {
    await tx.employerProfile.create({
      data: {
        userId: session.user.id,
        companyId: company!.id,
        designation,
        // Joining an existing company never grants admin — only the
        // creator (ownerUserId) has admin by default. Existing admins
        // can promote later via the team page.
        teamRole: CompanyTeamRole.RECRUITER,
        isCompanyAdmin: false,
      },
    });
    // Promote a CANDIDATE-role user to EMPLOYER on join (mirrors the
    // create-new path). Existing EMPLOYERs / ADMINs are left alone.
    if (session.user.role === "CANDIDATE") {
      await tx.user.update({
        where: { id: session.user.id },
        data: { role: "EMPLOYER" },
      });
    }
  });

  // Refresh the JWT so subsequent /employer/* requests see the new
  // role. See createCompany above for the rationale.
  if (session.user.role === "CANDIDATE") {
    await unstable_update?.({ user: { role: "EMPLOYER" } }).catch(() => undefined);
  }

  await audit({
    actorId: session.user.id,
    action: "employer.joined_existing_company",
    entity: "Company",
    entityId: company!.id,
    meta: { designation },
  });

  // TODO Notify the company admin so they can approve / promote the
  // joiner. Wave 6 (notifications) hooks up the queue; for now, the
  // /employer/team page lists pending team members the admin can vet.

  revalidatePath("/employer");
  revalidatePath("/employer/team");
  redirect("/employer");
}

const companyUpdateSchema = companySchema.omit({ designation: true }).extend({
  techStack: z.string().optional(),
  benefits: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  twitterUrl: z.string().url().optional().or(z.literal("")),
});

export async function updateCompany(formData: FormData) {
  const { employer } = await requireEmployerWithCompany();
  if (!employer.isCompanyAdmin) redirect("/403");
  const parsed = companyUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { techStack, benefits, ...rest } = parsed.data;
  await db.company.update({
    where: { id: employer.companyId },
    data: {
      ...rest,
      website: rest.website || null,
      linkedinUrl: rest.linkedinUrl || null,
      twitterUrl: rest.twitterUrl || null,
      techStack: techStack ? techStack.split(",").map((s) => s.trim()).filter(Boolean) : [],
      benefits: benefits ? benefits.split(",").map((s) => s.trim()).filter(Boolean) : [],
    },
  });
  revalidatePath("/employer");
  revalidatePath(`/company/${employer.company.slug}`);
}

// ─── Job posting ────────────────────────────────────────────

const jobSchema = z.object({
  title: z.string().min(3).max(140),
  description: z.string().min(20),
  responsibilities: z.string().optional(),
  requirements: z.string().optional(),
  benefits: z.string().optional(),
  profileMode: z.nativeEnum(ProfileMode),
  employmentType: z.nativeEnum(EmploymentType),
  workMode: z.nativeEnum(WorkMode),
  seniorityLevel: z.nativeEnum(SeniorityLevel),
  locations: z.string().optional(),
  experienceMin: z.coerce.number().int().min(0).optional(),
  experienceMax: z.coerce.number().int().min(0).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  salaryMax: z.coerce.number().min(0).optional(),
  salaryCurrency: z.string().default("INR"),
  salaryHidden: z.coerce.boolean().optional(),
  audience: z.nativeEnum(JobAudience).default(JobAudience.PUBLIC),
  publishNow: z.coerce.boolean().optional(),
  evDomainSlugs: z.string().optional(),
  skillNames: z.string().optional(),
});

/**
 * Apply the IIMjobs-style salary disclosure rule. DIYGURU_ONLY jobs are
 * routed exclusively to DIYguru students who don't have negotiation
 * leverage of seasoned engineers — letting recruiters hide the band on
 * those listings would push them to apply blind. We force `salaryHidden
 * = false` regardless of what the form sent. Recruiters who want to
 * keep the band private should post as PUBLIC instead.
 *
 * Returns the resolved (audience, salaryHidden) pair so the caller can
 * pass them straight into the Prisma write.
 */
function resolveSalaryDisclosure(
  audience: JobAudience,
  salaryHiddenInput: boolean | undefined,
): { audience: JobAudience; salaryHidden: boolean } {
  if (audience === JobAudience.DIYGURU_ONLY) {
    return { audience, salaryHidden: false };
  }
  return { audience, salaryHidden: Boolean(salaryHiddenInput) };
}

export async function createJob(formData: FormData) {
  const { session, employer } = await requireEmployerWithCompany();

  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.flatten() }, "[createJob] validation failed");
    redirect("/employer/jobs/new?error=" + encodeURIComponent("Please fill required fields"));
  }
  const data = parsed.data;

  const locations = data.locations
    ? data.locations.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const disclosure = resolveSalaryDisclosure(data.audience, data.salaryHidden);

  const job = await db.$transaction(
    async (tx) => {
      const created = await withUniqueSlug(`${data.title}-${employer.company.slug}`, (slug) =>
        tx.jobPosting.create({
          data: {
            slug,
            companyId: employer.companyId,
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
            salaryCurrency: data.salaryCurrency,
            salaryHidden: disclosure.salaryHidden,
            audience: disclosure.audience,
            status: data.publishNow ? JobStatus.OPEN : JobStatus.DRAFT,
            publishedAt: data.publishNow ? new Date() : null,
          },
        }),
      );

      if (data.evDomainSlugs) {
        const slugs = data.evDomainSlugs.split(",").map((s) => s.trim()).filter(Boolean);
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
        const names = data.skillNames.split(",").map((s) => s.trim()).filter(Boolean);
        if (names.length > 0) {
          const skills = await Promise.all(
            names.map((name) => {
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
              return tx.skill.upsert({
                where: { slug },
                create: { slug, name, category: "Imported" },
                update: {},
                select: { id: true },
              });
            }),
          );
          await tx.jobSkill.createMany({
            data: skills.map((s) => ({ jobId: created.id, skillId: s.id, required: true })),
            skipDuplicates: true,
          });
        }
      }

      return created;
    },
    { timeout: 15_000 },
  );

  await embeddingsQueue.add("job", { kind: "job", jobId: job.id });

  if (data.publishNow) {
    const { pingIndexNow, pingGoogleIndexing } = await import("@/lib/seo/indexnow");
    // Ping the canonical slug URL — `/jobs/{id}` redirects to it (308),
    // and pinging the redirect chain wastes a crawl budget round-trip.
    const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")}/job/${job.slug}`;
    void pingIndexNow(url);
    void pingGoogleIndexing(url, "URL_UPDATED");
    revalidatePath("/jobs.xml");
    revalidatePath("/sitemap-jobs.xml");

    // Fan out to candidates whose JobAlerts match this listing. Best-
    // effort: the matcher swallows individual queue failures so a
    // notification hiccup doesn't abort the job-creation redirect.
    const { matchAndNotifyJobAlerts } = await import("@/server/jobs/match-alerts");
    void matchAndNotifyJobAlerts(job.id).catch((err) =>
      logger.warn({ err, jobId: job.id }, "[createJob] alert fanout failed"),
    );
  }

  revalidatePath("/employer/jobs");
  redirect(`/employer/jobs/${job.id}`);
}

// ─── Company brand uploads (logo / banner) ─────────────────

const ALLOWED_BRAND_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sniffBrandImage(buffer: Buffer): "jpeg" | "png" | "webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "webp";
  return null;
}

async function uploadCompanyImage(
  formData: FormData,
  field: "logoUrl" | "bannerUrl",
  fieldName: string,
  maxBytes: number,
) {
  const { employer } = await requireEmployerWithCompany();
  if (!employer.isCompanyAdmin) redirect("/403");
  const file = formData.get(fieldName) as File | null;
  if (!file || file.size === 0) return;
  if (file.size > maxBytes) {
    throw new Error(`Image too large (max ${Math.round(maxBytes / 1024 / 1024)}MB).`);
  }
  if (file.type && !ALLOWED_BRAND_MIMES.has(file.type)) {
    throw new Error("Only JPEG, PNG, or WebP images.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffBrandImage(buffer);
  if (!kind) throw new Error("File content is not a valid image.");
  const ext = kind === "jpeg" ? "jpg" : kind;
  const contentType = `image/${kind === "jpeg" ? "jpeg" : kind}`;
  const { objectKey, buckets, s3, publicUrl } = await import("@/lib/storage");
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const key = objectKey(`companies/${employer.companyId}/${field}`, ext);
  await s3.send(
    new PutObjectCommand({
      Bucket: buckets.logos,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
    }),
  );
  await db.company.update({
    where: { id: employer.companyId },
    data: { [field]: publicUrl("logos", key) },
  });
  revalidatePath("/employer/company");
  revalidatePath(`/company/${employer.company.slug}`);
}

export async function uploadCompanyLogo(formData: FormData) {
  await uploadCompanyImage(formData, "logoUrl", "logo", 4 * 1024 * 1024);
}

export async function uploadCompanyBanner(formData: FormData) {
  await uploadCompanyImage(formData, "bannerUrl", "banner", 8 * 1024 * 1024);
}

// ─── Bulk-invite candidates from /matches ──────────────────

const inviteSchema = z.object({
  jobId: z.string(),
  candidateIds: z.string().min(1),  // comma-separated
});

export async function bulkInviteCandidates(formData: FormData) {
  const { session, employer } = await requireEmployerWithCompany();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const job = await db.jobPosting.findUnique({
    where: { id: parsed.data.jobId },
    select: { id: true, companyId: true, title: true, status: true },
  });
  if (!job) return;
  if (session.user.role !== "ADMIN" && job.companyId !== employer.companyId) redirect("/403");
  if (job.status !== "OPEN" && job.status !== "DRAFT") {
    redirect(`/employer/jobs/${job.id}/matches?error=` + encodeURIComponent("Job is not open"));
  }

  const candidateIds = parsed.data.candidateIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  if (candidateIds.length === 0) return;

  // Pull candidates + skip those already applied to this job
  const candidates = await db.candidateProfile.findMany({
    where: { id: { in: candidateIds } },
    select: { id: true, firstName: true, user: { select: { id: true } } },
  });
  const existing = await db.application.findMany({
    where: { jobId: job.id, candidateId: { in: candidateIds } },
    select: { candidateId: true },
  });
  const skipIds = new Set(existing.map((e) => e.candidateId));
  const fresh = candidates.filter((c) => !skipIds.has(c.id));

  if (fresh.length === 0) {
    redirect(
      `/employer/jobs/${job.id}/matches?notice=` +
        encodeURIComponent("Those candidates have already applied to this job."),
    );
  }

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.application.createMany({
      data: fresh.map((c) => ({
        jobId: job.id,
        candidateId: c.id,
        stage: "APPLIED" as const,
        source: "AI_INVITED" as const,
        appliedAt: now,
      })),
      skipDuplicates: true,
    });
    // Stage history rows for the freshly-created applications
    const newApps = await tx.application.findMany({
      where: {
        jobId: job.id,
        candidateId: { in: fresh.map((c) => c.id) },
        source: "AI_INVITED",
      },
      select: { id: true, candidateId: true },
    });
    await tx.stageHistory.createMany({
      data: newApps.map((a) => ({
        applicationId: a.id,
        toStage: "APPLIED" as const,
        byUserId: session.user.id,
        reason: "Invited from AI matches",
      })),
    });
    await tx.jobPosting.update({
      where: { id: job.id },
      data: { appliesCount: { increment: fresh.length } },
    });
  });

  // Fan out invitation notifications
  const { notificationsQueue } = await import("@/lib/queues");
  for (const c of fresh) {
    await notificationsQueue.add("invited", {
      userId: c.user.id,
      type: "application.invited",
      title: `You've been invited to apply: ${job.title}`,
      body: `A recruiter at ${employer.company.name} thinks you're a strong fit. Open your dashboard to review.`,
      link: "/me/applications",
      channels: ["IN_APP", "EMAIL"],
    });
  }

  await audit({
    actorId: session.user.id,
    action: "candidates.bulk_invited",
    entity: "JobPosting",
    entityId: job.id,
    meta: { invited: fresh.length, skipped: skipIds.size },
  });

  revalidatePath(`/employer/jobs/${job.id}/matches`);
  revalidatePath(`/employer/jobs/${job.id}/ats`);
  redirect(
    `/employer/jobs/${job.id}/matches?notice=` +
      encodeURIComponent(`Invited ${fresh.length} candidate${fresh.length === 1 ? "" : "s"}.`),
  );
}

// ─── Save / unsave candidates ───────────────────────────────

export async function saveCandidate(formData: FormData) {
  const session = await requireEmployer();
  const candidateId = z.string().parse(formData.get("candidateId"));
  const note = String(formData.get("note") ?? "").slice(0, 500) || null;
  await db.savedCandidate.upsert({
    where: { candidateId_employerUserId: { candidateId, employerUserId: session.user.id } },
    create: { candidateId, employerUserId: session.user.id, note },
    update: { note },
  });
  revalidatePath("/employer/saved");
  revalidatePath(`/${candidateId}`);
}

export async function unsaveCandidate(formData: FormData) {
  const session = await requireEmployer();
  const candidateId = z.string().parse(formData.get("candidateId"));
  await db.savedCandidate.deleteMany({
    where: { candidateId, employerUserId: session.user.id },
  });
  revalidatePath("/employer/saved");
}

/**
 * Bulk variant — saves up to 50 candidates to the recruiter's shortlist
 * pile in one shot. Idempotent via upsert; if the recruiter ticks a
 * candidate they'd already saved, we just leave the existing row alone.
 *
 * Optional `note` is attached to every new row (lets the recruiter say
 * "shortlist for Q2 BMS roles" once and have it propagate).
 */
export async function bulkSaveCandidates(input: {
  candidateIds: string[];
  note?: string;
}): Promise<{ ok: boolean; saved: number; skipped: number; message?: string }> {
  const session = await requireEmployer();
  const ids = input.candidateIds.filter((s) => typeof s === "string" && s.length > 0).slice(0, 50);
  if (ids.length === 0) {
    return { ok: false, saved: 0, skipped: 0, message: "Pick at least one candidate." };
  }
  const note = (input.note ?? "").slice(0, 500) || null;

  let saved = 0;
  let skipped = 0;
  for (const candidateId of ids) {
    try {
      await db.savedCandidate.upsert({
        where: { candidateId_employerUserId: { candidateId, employerUserId: session.user.id } },
        create: { candidateId, employerUserId: session.user.id, note },
        // Don't overwrite existing notes on a re-save — recruiter notes
        // are intentional even when added per-candidate.
        update: {},
      });
      saved += 1;
    } catch {
      skipped += 1;
    }
  }
  await audit({
    actorId: session.user.id,
    action: "candidates.bulk_saved",
    entity: "User",
    entityId: session.user.id,
    meta: { saved, skipped, total: ids.length },
  });
  revalidatePath("/employer/saved");
  return { ok: true, saved, skipped };
}

export async function updateJobStatus(formData: FormData) {
  const { employer } = await requireEmployerWithCompany();
  const id = String(formData.get("id"));
  const status = z.nativeEnum(JobStatus).parse(formData.get("status"));

  const job = await db.jobPosting.findUnique({ where: { id }, select: { companyId: true } });
  if (!job || job.companyId !== employer.companyId) redirect("/403");

  await db.jobPosting.update({
    where: { id },
    data: {
      status,
      publishedAt: status === JobStatus.OPEN ? new Date() : undefined,
    },
  });

  // Tell search engines about the change immediately. JobPostings are
  // time-sensitive so we ping IndexNow + Google's Indexing API rather than
  // wait for the next sitemap fetch.
  const { pingIndexNow, pingGoogleIndexing } = await import("@/lib/seo/indexnow");
  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")}/jobs/${id}`;
  void pingIndexNow(url);
  void pingGoogleIndexing(url, status === JobStatus.OPEN ? "URL_UPDATED" : "URL_DELETED");

  revalidatePath("/employer/jobs");
  revalidatePath(`/employer/jobs/${id}`);
  revalidatePath("/jobs.xml");
  revalidatePath("/sitemap-jobs.xml");
}

// ─── Bulk InMail (cold outreach to a shortlist) ────────────

const bulkInMailSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(50),
  subject: z.string().max(200).optional(),
  body: z.string().min(2).max(4000),
});

/**
 * LinkedIn-Recruiter-style bulk InMail. The recruiter picks up to 50
 * candidates from the talent search list and posts the same message to
 * each. We open one cold-outreach MessageThread per (recruiter,
 * candidate) pair (deduped on subsequent sends), insert one Message,
 * stamp lastMessageAt, and fan a notification.
 *
 * Per-recruiter rate-limit (200 outreach messages / 24h) keeps abuse
 * bounded without throttling normal recruiter flow. Skipped recipients
 * (already at quota, blocked thread, missing user record) are returned
 * to the client so the UI can surface "Sent X · Skipped Y".
 *
 * `{{firstName}}` substitution lets recruiters keep the message
 * personal-feeling without writing N copies. We only substitute that
 * one token to keep behaviour predictable + auditable.
 */
export async function sendBulkInMail(input: {
  candidateIds: string[];
  subject?: string;
  body: string;
}): Promise<{ ok: boolean; sent: number; skipped: number; message?: string }> {
  try {
  const { session, employer } = await requireEmployerWithCompany();
  const parsed = bulkInMailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, sent: 0, skipped: 0, message: "Invalid message payload." };
  }
  const { candidateIds, subject, body } = parsed.data;

  try {
    // Account-level cap. The window is 24h; one bulk send of N counts as N
    // toward the cap, applied after we know how many recipients are real.
    await rateLimitOrThrow(`bulk-inmail:${session.user.id}`, "bulkInMail");
  } catch (e) {
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      message: e instanceof Error ? e.message : "Rate limited.",
    };
  }

  // Pull each candidate's user.id (recipient) + first name for the
  // {{firstName}} substitution. We exclude candidates whose visibility
  // forbids cold outreach (PRIVATE) — they shouldn't appear on the
  // recruiter list anyway, but defence-in-depth here.
  const candidates = await db.candidateProfile.findMany({
    where: {
      id: { in: candidateIds },
      cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      user: { select: { id: true } },
    },
  });
  if (candidates.length === 0) {
    return { ok: false, sent: 0, skipped: 0, message: "No reachable candidates." };
  }

  const senderId = session.user.id;
  let sent = 0;
  let skipped = 0;

  // We deliberately process serially rather than in a single transaction —
  // a slow notification or a missing thread for one recipient should never
  // roll back successful sends to other recipients.
  for (const c of candidates) {
    const personalised = body.replace(/\{\{\s*firstName\s*\}\}/gi, c.firstName);
    try {
      // One thread per (recruiter, candidate) cold-outreach pair. We can't
      // express the dedupe with @@unique because candidateUserId +
      // employerUserId are both nullable and shared with application
      // threads; instead we look it up + create-if-missing inside a
      // serialisable block. Race risk is negligible at this volume.
      let thread = await db.messageThread.findFirst({
        where: {
          applicationId: null,
          candidateUserId: c.user.id,
          employerUserId: senderId,
        },
        select: { id: true },
      });
      if (!thread) {
        thread = await db.messageThread.create({
          data: {
            candidateUserId: c.user.id,
            employerUserId: senderId,
          },
          select: { id: true },
        });
      }

      // Subject is prepended to the body so the existing per-thread chat
      // UI doesn't need a new column. The convention "**Subject** — body"
      // is what LinkedIn shows in their thread preview line.
      const finalBody = subject ? `**${subject}**\n\n${personalised}` : personalised;
      await db.message.create({
        data: { threadId: thread.id, senderId, body: finalBody },
      });
      await db.messageThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date() },
      });

      await notificationsQueue.add("inmail", {
        userId: c.user.id,
        type: "message.new",
        title: `Message from ${employer.company.name}`,
        body: finalBody.slice(0, 140),
        link: `/me/messages/${thread.id}`,
        channels: ["IN_APP", "EMAIL"],
      });
      sent += 1;
    } catch (err) {
      logger.warn({ err, candidateId: c.id }, "[bulk-inmail] send failed for candidate");
      skipped += 1;
    }
  }

  await audit({
    actorId: senderId,
    action: "recruiter.bulk_inmail",
    entity: "User",
    entityId: senderId,
    meta: { sent, skipped, recipients: candidates.length, subject: subject ?? null },
  });

  revalidatePath("/employer/messages");
  return { ok: true, sent, skipped };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[bulk-inmail] unhandled error");
    return {
      ok: false,
      sent: 0,
      skipped: 0,
      message:
        "Couldn't send the messages — the team has been notified. Try again in a moment.",
    };
  }
}
