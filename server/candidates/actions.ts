"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { objectKey, presignUpload, presignDownload, buckets, s3, publicUrl } from "@/lib/storage";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { resumeParseQueue, embeddingsQueue, resumeDraftQueue } from "@/lib/queues";
import { parseResume } from "@/lib/ai/resume-parser";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { recalcCompleteness } from "@/lib/profile-completeness";
import {
  ProfileMode,
  AvailabilityStatus,
  CVVisibility,
  RelocationPref,
  SkillProficiency,
} from "@prisma/client";

async function requireCandidate() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "CANDIDATE" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  return { session, profile };
}

/**
 * Enqueue an AI résumé draft for this candidate. Coalesces multiple edits
 * in a 5-minute window into a single PDF generation by reusing the same
 * BullMQ jobId (the BullMQ behaviour is "ignore duplicate add of pending
 * jobId"). Fire-and-forget — never throws into the caller, so a queue
 * outage doesn't break profile-edit UX.
 */
async function enqueueResumeDraft(candidateId: string) {
  try {
    await resumeDraftQueue.add(
      "draft",
      { candidateId },
      {
        // Same jobId per 5-min window deduplicates rapid edits.
        jobId: `${candidateId}-${Math.floor(Date.now() / 300_000)}`,
        // Small delay so a burst of edits all land before the worker fires.
        delay: 8_000,
      },
    );
  } catch (err) {
    logger.warn({ err, candidateId }, "[resume-draft] enqueue failed");
  }
}

// ─── Onboarding step 1: profile mode ───────────────────────

export async function setProfileMode(formData: FormData) {
  const { profile } = await requireCandidate();
  const mode = formData.get("profileMode");
  const parsed = z.nativeEnum(ProfileMode).safeParse(mode);
  if (!parsed.success) return;

  await db.candidateProfile.update({
    where: { id: profile.id },
    data: { profileMode: parsed.data },
  });
  redirect("/onboarding/resume");
}

// ─── Onboarding step 2: resume upload + parse ───────────────

const RESUME_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Content sniffing — never trust client-supplied MIME alone.
function sniffResumeKind(buffer: Buffer): "pdf" | "docx" | "doc" | null {
  if (buffer.length < 8) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05) && (buffer[3] === 0x04 || buffer[3] === 0x06)) return "docx";
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "doc";
  return null;
}

const ALLOWED_AVATAR_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function sniffImageKind(buffer: Buffer): "jpeg" | "png" | "gif" | "webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return "gif";
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "webp";
  return null;
}

export async function uploadAndParseResume(formData: FormData) {
  const { profile } = await requireCandidate();
  await rateLimitOrThrow(`resume:${profile.userId}`, "resumeUpload");
  const file = formData.get("resume") as File | null;
  if (!file) throw new Error("No file provided");

  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Resume file is too large (max 10MB).");
  }
  if (file.size === 0) {
    throw new Error("Empty file.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Authoritative content check — magic bytes only. Client MIME and filename
  // are advisory; an attacker can lie about both.
  const kind = sniffResumeKind(buffer);
  if (!kind) {
    throw new Error("Only PDF or DOCX resumes are accepted.");
  }
  // Cross-check declared MIME if present — block declared-image-but-actually-pdf etc.
  if (file.type && !RESUME_MIME_TYPES.has(file.type) && !["application/octet-stream", ""].includes(file.type)) {
    throw new Error("Resume content does not match declared type.");
  }

  const ext = kind === "doc" ? "doc" : kind === "docx" ? "docx" : "pdf";
  const key = objectKey(`resumes/${profile.id}`, ext);
  const sniffedContentType = kind === "pdf"
    ? "application/pdf"
    : kind === "docx"
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "application/msword";

  await s3.send(
    new PutObjectCommand({
      Bucket: buckets.resumes,
      Key: key,
      Body: buffer,
      ContentType: sniffedContentType,
      // Resumes are sensitive — never serve them publicly. The bucket should
      // also have BlockPublicAccess enabled at the storage layer.
    }),
  );

  // Store the bucket-relative key, NOT a public URL. Callers must request a
  // signed URL via getResumeDownloadUrl() to actually fetch it.
  const resumeUrl = key;

  // Synchronous parse for the onboarding flow so the user sees results immediately.
  // (Async re-parse on subsequent uploads goes through the queue.)
  let parsed;
  try {
    parsed = await parseResume(buffer, file.type || "application/pdf");
  } catch (err) {
    logger.warn({ err }, "[resume] inline parse failed, falling back to queue");
    await resumeParseQueue.add("parse", {
      candidateId: profile.id,
      bucket: buckets.resumes,
      key,
      mimeType: file.type || "application/pdf",
    });
  }

  await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      resumeUrl,
      resumeParsedAt: parsed ? new Date() : null,
      resumeParseDraft: parsed
        ? (parsed as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  redirect("/onboarding/confirm");
}

// ─── Onboarding step 3: commit parsed draft ────────────────

export async function applyResumeDraft() {
  const { profile } = await requireCandidate();
  const fresh = await db.candidateProfile.findUnique({
    where: { id: profile.id },
  });
  if (!fresh?.resumeParseDraft) {
    redirect("/onboarding/resume");
  }
  const draft = fresh!.resumeParseDraft as Record<string, unknown>;

  await db.$transaction(async (tx) => {
    await tx.candidateProfile.update({
      where: { id: profile.id },
      data: {
        firstName: (draft.firstName as string) || profile.firstName,
        lastName: (draft.lastName as string) ?? profile.lastName,
        headline: (draft.headline as string) ?? null,
        summary: (draft.summary as string) ?? null,
        location: (draft.location as string) ?? null,
        phone: (draft.phone as string) ?? null,
        linkedinUrl: (draft.linkedinUrl as string) ?? null,
        githubUrl: (draft.githubUrl as string) ?? null,
        portfolioUrl: (draft.portfolioUrl as string) ?? null,
        totalExperienceMonths: (draft.totalExperienceMonths as number) ?? 0,
        languagesSpoken: (draft.languages as string[]) ?? [],
      },
    });

    // Wipe and re-create experiences/education/projects/certifications from the draft.
    await tx.experience.deleteMany({ where: { candidateId: profile.id } });
    await tx.education.deleteMany({ where: { candidateId: profile.id } });
    await tx.certification.deleteMany({ where: { candidateId: profile.id } });
    await tx.project.deleteMany({ where: { candidateId: profile.id } });

    for (const e of (draft.experiences as Array<Record<string, unknown>>) ?? []) {
      await tx.experience.create({
        data: {
          candidateId: profile.id,
          title: String(e.title ?? "Role"),
          company: String(e.company ?? "Company"),
          location: (e.location as string) ?? null,
          startDate: e.startDate ? new Date(`${e.startDate}-01`) : new Date(),
          endDate: e.endDate ? new Date(`${e.endDate}-01`) : null,
          current: Boolean(e.current),
          description: (e.description as string) ?? null,
        },
      });
    }
    for (const ed of (draft.education as Array<Record<string, unknown>>) ?? []) {
      await tx.education.create({
        data: {
          candidateId: profile.id,
          institution: String(ed.institution ?? "Institution"),
          degree: (ed.degree as string) ?? null,
          field: (ed.field as string) ?? null,
          startYear: (ed.startYear as number) ?? null,
          endYear: (ed.endYear as number) ?? null,
          grade: (ed.grade as string) ?? null,
        },
      });
    }
    for (const c of (draft.certifications as Array<Record<string, unknown>>) ?? []) {
      await tx.certification.create({
        data: {
          candidateId: profile.id,
          name: String(c.name ?? "Certification"),
          issuer: (c.issuer as string) ?? null,
          issueDate: c.issueDate ? new Date(`${c.issueDate}-01`) : null,
          credentialId: (c.credentialId as string) ?? null,
          isDIYguru: Boolean(c.isDIYguru),
        },
      });
    }
    for (const p of (draft.projects as Array<Record<string, unknown>>) ?? []) {
      await tx.project.create({
        data: {
          candidateId: profile.id,
          title: String(p.title ?? "Project"),
          description: (p.description as string) ?? null,
          url: (p.url as string) ?? null,
          techStack: (p.techStack as string[]) ?? [],
        },
      });
    }

    // Match parsed skill names against canonical Skill rows; create missing ones.
    const skillNames: string[] = (draft.skills as string[]) ?? [];
    if (skillNames.length) {
      const existing = await tx.skill.findMany({
        where: { name: { in: skillNames, mode: "insensitive" } },
      });
      const existingMap = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

      await tx.candidateSkill.deleteMany({ where: { candidateId: profile.id } });

      for (const name of skillNames) {
        let skill = existingMap.get(name.toLowerCase());
        if (!skill) {
          const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          skill = await tx.skill.upsert({
            where: { slug },
            create: { slug, name, category: "Imported" },
            update: {},
          });
        }
        await tx.candidateSkill.create({
          data: {
            candidateId: profile.id,
            skillId: skill.id,
            proficiency: SkillProficiency.INTERMEDIATE,
          },
        });
      }
    }

    // Map detected EV domains.
    const evDomainSlugs: string[] = (draft.evDomains as string[]) ?? [];
    if (evDomainSlugs.length) {
      const domains = await tx.eVDomain.findMany({
        where: { slug: { in: evDomainSlugs } },
      });
      await tx.candidateEVDomain.deleteMany({ where: { candidateId: profile.id } });
      for (const d of domains) {
        await tx.candidateEVDomain.create({
          data: { candidateId: profile.id, evDomainId: d.id },
        });
      }
    }

    // Mark DIYguru "mentioned" — actual verification still requires admin/CSV match.
    if (draft.detectedDIYguru) {
      await tx.candidateProfile.update({
        where: { id: profile.id },
        data: { labExposureTags: { push: "diyguru-mentioned" } },
      });
    }
  });

  await embeddingsQueue.add("candidate", { kind: "candidate", candidateId: profile.id });
  await recalcCompleteness(profile.id);
  revalidatePath("/me");
  revalidatePath("/me/profile");
  redirect("/onboarding/preferences");
}

// ─── Onboarding step 4: preferences ────────────────────────

const preferencesSchema = z.object({
  location: z.string().optional(),
  preferredCities: z.string().optional(),
  relocationPref: z.nativeEnum(RelocationPref),
  availabilityStatus: z.nativeEnum(AvailabilityStatus),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional(),
  expectedCtcMin: z.coerce.number().min(0).optional(),
  expectedCtcMax: z.coerce.number().min(0).optional(),
  cvVisibility: z.nativeEnum(CVVisibility),
  openToWork: z.coerce.boolean().optional(),
});

export async function savePreferences(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = preferencesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.flatten() }, "[preferences] validation failed");
    return;
  }
  const { preferredCities, ...rest } = parsed.data;
  await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      ...rest,
      preferredCities: preferredCities
        ? preferredCities.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      onboardingCompletedAt: new Date(),
    },
  });
  await recalcCompleteness(profile.id);
  revalidatePath("/me");
  redirect("/me");
}

// ─── Profile editor: section-level mutations ───────────────

const headerSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional().nullable(),
  headline: z.string().max(160).optional().nullable(),
  summary: z.string().max(2000).optional().nullable(),
  location: z.string().max(120).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable().or(z.literal("")),
  githubUrl: z.string().url().optional().nullable().or(z.literal("")),
  portfolioUrl: z.string().url().optional().nullable().or(z.literal("")),
});

export async function saveHeader(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = headerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await db.candidateProfile.update({
    where: { id: profile.id },
    data: parsed.data,
  });
  await embeddingsQueue.add("candidate", { kind: "candidate", candidateId: profile.id });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

const experienceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  company: z.string().min(1), // free-text fallback (always required)
  // Optional FK to a Company entity. The EntityPicker on the editor side
  // posts the id when the user picked or created an entry; otherwise empty.
  companyId: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  startDate: z.string().min(7), // YYYY-MM
  endDate: z.string().optional().nullable(),
  current: z.coerce.boolean().optional(),
  description: z.string().optional().nullable(),
});

export async function saveExperience(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = experienceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, startDate, endDate, current, companyId, ...rest } = parsed.data;
  const data = {
    ...rest,
    candidateId: profile.id,
    // Empty string from the hidden input means "no FK" — coerce to null so
    // Prisma doesn't try to look up an empty cuid.
    companyId: companyId && companyId.length > 0 ? companyId : null,
    startDate: new Date(`${startDate}-01`),
    endDate: !current && endDate ? new Date(`${endDate}-01`) : null,
    current: Boolean(current),
  };
  if (id) {
    // Scope by candidateId so an attacker can't update another candidate's row.
    const result = await db.experience.updateMany({
      where: { id, candidateId: profile.id },
      data,
    });
    if (result.count === 0) return;
  } else {
    await db.experience.create({ data });
  }
  await embeddingsQueue.add("candidate", { kind: "candidate", candidateId: profile.id });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
}

export async function deleteExperience(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await db.experience.deleteMany({ where: { id, candidateId: profile.id } });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
}

const educationSchema = z.object({
  id: z.string().optional(),
  institution: z.string().min(1),
  // Optional FK — same pattern as Experience.companyId. Empty string from
  // the hidden input means "no link, store as text only".
  institutionId: z.string().optional().nullable(),
  degree: z.string().optional().nullable(),
  field: z.string().optional().nullable(),
  startYear: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
  endYear: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
  grade: z.string().optional().nullable(),
});

export async function saveEducation(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = educationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, institutionId, ...rest } = parsed.data;
  const data = {
    ...rest,
    institutionId: institutionId && institutionId.length > 0 ? institutionId : null,
  };
  if (id) {
    const result = await db.education.updateMany({
      where: { id, candidateId: profile.id },
      data,
    });
    if (result.count === 0) return;
  } else {
    await db.education.create({ data: { ...data, candidateId: profile.id } });
  }
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
}

export async function deleteEducation(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = formData.get("id");
  if (typeof id !== "string") return;
  await db.education.deleteMany({ where: { id, candidateId: profile.id } });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
}

export async function setProfileMode_Edit(formData: FormData) {
  const { profile } = await requireCandidate();
  const mode = z.nativeEnum(ProfileMode).parse(formData.get("profileMode"));
  await db.candidateProfile.update({ where: { id: profile.id }, data: { profileMode: mode } });
  revalidatePath("/me/profile");
}

export async function uploadAvatar(formData: FormData) {
  const { profile } = await requireCandidate();
  await rateLimitOrThrow(`avatar:${profile.userId}`, "resumeUpload");
  const file = formData.get("avatar") as File | null;
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("Avatar must be under 4MB.");
  }
  if (file.size === 0) {
    throw new Error("Empty file.");
  }
  if (file.type && !ALLOWED_AVATAR_MIMES.has(file.type)) {
    throw new Error("Only JPEG, PNG, WEBP, or GIF images are accepted.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffImageKind(buffer);
  if (!kind) {
    // Explicitly rejects SVG (no magic bytes, text-based) and any other format.
    throw new Error("File content is not a supported image (JPEG/PNG/WebP/GIF).");
  }
  const ext = kind === "jpeg" ? "jpg" : kind;
  const contentType = `image/${kind === "jpeg" ? "jpeg" : kind}`;
  const key = objectKey(`avatars/${profile.id}`, ext);
  await s3.send(
    new PutObjectCommand({
      Bucket: buckets.avatars,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read",
      // Defense in depth: stop browsers from sniffing the response into something
      // executable, even if a future upload bypasses our type check.
      Metadata: { "x-content-type-options": "nosniff" },
    }),
  );
  await db.candidateProfile.update({
    where: { id: profile.id },
    data: { profilePhotoUrl: publicUrl("avatars", key) },
  });
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath("/me");
  revalidatePath(`/${profile.slug}`);
}

/**
 * Mint a short-lived signed URL for downloading a candidate's resume.
 * Authorization rules:
 *   - The candidate themselves
 *   - An admin
 *   - Any employer (assuming they're a verified recruiter)
 *
 * Pass either an applicationId (preferred — scoped to a single match) or
 * the candidateId. Returns null if the caller is not authorized.
 */
export async function getResumeDownloadUrl(input: {
  applicationId?: string;
  candidateSlug?: string;
}): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return null;
  let resumeKey: string | null = null;
  let candidateUserId: string | null = null;

  if (input.applicationId) {
    const app = await db.application.findUnique({
      where: { id: input.applicationId },
      select: {
        resumeSnapshotUrl: true,
        candidate: { select: { userId: true, resumeUrl: true } },
        job: { select: { companyId: true } },
      },
    });
    if (!app) return null;
    resumeKey = app.resumeSnapshotUrl ?? app.candidate.resumeUrl ?? null;
    candidateUserId = app.candidate.userId;

    // Authorization: candidate, admin, or recruiter at the company that posted the job
    if (session.user.role !== "ADMIN" && session.user.id !== candidateUserId) {
      const employer = await db.employerProfile.findUnique({
        where: { userId: session.user.id },
        select: { companyId: true },
      });
      if (!employer || employer.companyId !== app.job.companyId) return null;
    }
  } else if (input.candidateSlug) {
    const c = await db.candidateProfile.findUnique({
      where: { slug: input.candidateSlug },
      select: {
        resumeUrl: true,
        aiResumeUrl: true,
        useAiResume: true,
        userId: true,
        cvVisibility: true,
      },
    });
    if (!c) return null;
    // Pick the same source the public profile picks. AI résumé wins
    // when the candidate has opted in via `useAiResume` AND the
    // worker has actually finished generating one.
    resumeKey = c.useAiResume && c.aiResumeUrl ? c.aiResumeUrl : c.resumeUrl;
    if (!resumeKey) return null;
    candidateUserId = c.userId;
    // Public profile résumé — only candidate, admin, or employer (if visibility allows)
    if (session.user.role !== "ADMIN" && session.user.id !== candidateUserId) {
      if (c.cvVisibility === "PRIVATE") return null;
      if (c.cvVisibility === "EMPLOYERS_ONLY" && session.user.role !== "EMPLOYER") return null;
    }
  } else {
    return null;
  }

  if (!resumeKey) return null;
  // Normalise the stored value back to a bare bucket key. Three
  // shapes have ever been written into these columns:
  //   1. `${key}` — the current shape for `resumeUrl` (manual upload)
  //   2. `${bucket}/${key}` — an earlier shape, stripped here
  //   3. `${publicUrl}/${bucket}/${key}` — what the AI résumé worker
  //      wrote before the fix landed; matches "https://.../emce-resumes/..."
  // We try (3) first, then (2), then accept the value as-is.
  const fullUrlMatch = resumeKey.match(/\/[^/]+\/(.+)$/);
  let key = resumeKey;
  if (resumeKey.startsWith("http")) {
    // Strip everything up to and including `/{bucket}/`.
    const after = resumeKey.replace(
      new RegExp(`^https?://[^/]+/${buckets.resumes}/`),
      "",
    );
    if (after !== resumeKey) key = after;
    else if (fullUrlMatch) key = fullUrlMatch[1];
  } else {
    key = resumeKey.replace(new RegExp(`^${buckets.resumes}/`), "");
  }
  return presignDownload("resumes", key, 60 * 5);
}

// ─── Custom URL / username ─────────────────────────────────

export async function checkUsernameAvailability(username: string): Promise<{
  ok: boolean;
  reason?: "too-short" | "too-long" | "format" | "reserved" | "taken";
  current?: boolean;
}> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  const { checkSlug, normalizeSlug } = await import("@/lib/reserved-slugs");
  const normalized = normalizeSlug(username);
  const reason = checkSlug(normalized);
  if (reason !== "ok") return { ok: false, reason };

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { slug: true },
  });
  if (profile?.slug === normalized) return { ok: true, current: true };

  const taken = await db.candidateProfile.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });
  if (taken) return { ok: false, reason: "taken" };
  return { ok: true };
}

export async function updateCandidateUsername(formData: FormData) {
  const { profile } = await requireCandidate();
  const raw = String(formData.get("username") ?? "");

  const { checkSlug, normalizeSlug } = await import("@/lib/reserved-slugs");
  const next = normalizeSlug(raw);
  const reason = checkSlug(next);
  if (reason !== "ok") {
    const msg =
      reason === "too-short" ? "Username must be at least 3 characters."
      : reason === "too-long" ? "Username must be 40 characters or fewer."
      : reason === "format" ? "Use lowercase letters, numbers, and hyphens only."
      : "That username is reserved.";
    redirect("/me/profile?error=" + encodeURIComponent(msg));
  }

  if (next === profile.slug) {
    redirect("/me/profile?notice=" + encodeURIComponent("Username unchanged."));
  }

  const taken = await db.candidateProfile.findUnique({
    where: { slug: next },
    select: { id: true },
  });
  if (taken && taken.id !== profile.id) {
    redirect("/me/profile?error=" + encodeURIComponent("That username is already taken."));
  }

  const previousSlug = profile.slug;
  try {
    await db.candidateProfile.update({
      where: { id: profile.id },
      data: { slug: next },
    });
  } catch {
    redirect("/me/profile?error=" + encodeURIComponent("Couldn't claim that username — try another."));
  }

  revalidatePath("/me/profile");
  revalidatePath("/me");
  revalidatePath(`/${previousSlug}`);
  revalidatePath(`/${next}`);
  redirect("/me/profile?notice=" + encodeURIComponent(`Your URL is now emobility.careers/${next}`));
}

// ─── Languages ─────────────────────────────────────────────

export async function setLanguages(formData: FormData) {
  const { profile } = await requireCandidate();
  const raw = String(formData.get("languages") ?? "");
  const langs = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
  await db.candidateProfile.update({
    where: { id: profile.id },
    data: { languagesSpoken: langs },
  });
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

// ─── Skills (manual add / remove on profile) ───────────────

const skillAddSchema = z.object({
  name: z.string().min(1).max(80),
  proficiency: z.nativeEnum(SkillProficiency).default(SkillProficiency.INTERMEDIATE),
  yearsExp: z.coerce.number().min(0).max(40).optional(),
});

export async function addSkillToProfile(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = skillAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const skill = await db.skill.upsert({
    where: { slug },
    create: { slug, name: parsed.data.name, category: "Manual" },
    update: {},
    select: { id: true },
  });
  await db.candidateSkill.upsert({
    where: { candidateId_skillId: { candidateId: profile.id, skillId: skill.id } },
    create: {
      candidateId: profile.id,
      skillId: skill.id,
      proficiency: parsed.data.proficiency,
      yearsExp: parsed.data.yearsExp ?? null,
    },
    update: {
      proficiency: parsed.data.proficiency,
      yearsExp: parsed.data.yearsExp ?? null,
    },
  });
  await embeddingsQueue.add("candidate", { kind: "candidate", candidateId: profile.id });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

export async function removeSkillFromProfile(formData: FormData) {
  const { profile } = await requireCandidate();
  const skillId = z.string().parse(formData.get("skillId"));
  await db.candidateSkill.deleteMany({
    where: { candidateId: profile.id, skillId },
  });
  await embeddingsQueue.add("candidate", { kind: "candidate", candidateId: profile.id });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

// ─── Certifications CRUD ───────────────────────────────────

const certSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(140),
  issuer: z.string().max(120).optional().nullable(),
  issueDate: z.string().optional().nullable(),
  credentialId: z.string().max(120).optional().nullable(),
  credentialUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

export async function saveCertification(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = certSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, issueDate, credentialUrl, ...rest } = parsed.data;
  const data = {
    ...rest,
    issueDate: issueDate ? new Date(`${issueDate}-01`) : null,
    credentialUrl: credentialUrl || null,
  };
  if (id) {
    const r = await db.certification.updateMany({
      where: { id, candidateId: profile.id },
      data,
    });
    if (r.count === 0) return;
  } else {
    await db.certification.create({ data: { ...data, candidateId: profile.id } });
  }
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

export async function deleteCertification(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = z.string().parse(formData.get("id"));
  await db.certification.deleteMany({ where: { id, candidateId: profile.id } });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

// ─── Projects CRUD ─────────────────────────────────────────

const projectSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(140),
  description: z.string().max(2000).optional().nullable(),
  url: z.string().url().optional().or(z.literal("")).nullable(),
  techStack: z.string().optional(),
});

export async function saveProject(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, techStack, url, ...rest } = parsed.data;
  const data = {
    ...rest,
    url: url || null,
    techStack: techStack
      ? techStack.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20)
      : [],
  };
  if (id) {
    const r = await db.project.updateMany({
      where: { id, candidateId: profile.id },
      data,
    });
    if (r.count === 0) return;
  } else {
    await db.project.create({ data: { ...data, candidateId: profile.id } });
  }
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

export async function deleteProject(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = z.string().parse(formData.get("id"));
  await db.project.deleteMany({ where: { id, candidateId: profile.id } });
  await enqueueResumeDraft(profile.id);
  await recalcCompleteness(profile.id);
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

// ─── Awards CRUD ───────────────────────────────────────────

const awardSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).max(140),
  issuer: z.string().max(120).optional().nullable(),
  date: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
});

export async function saveAward(formData: FormData) {
  const { profile } = await requireCandidate();
  const parsed = awardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, date, ...rest } = parsed.data;
  const data = { ...rest, date: date ? new Date(`${date}-01`) : null };
  if (id) {
    const r = await db.award.updateMany({
      where: { id, candidateId: profile.id },
      data,
    });
    if (r.count === 0) return;
  } else {
    await db.award.create({ data: { ...data, candidateId: profile.id } });
  }
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

export async function deleteAward(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = z.string().parse(formData.get("id"));
  await db.award.deleteMany({ where: { id, candidateId: profile.id } });
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
}

// ─── Canonical skill autocomplete ──────────────────────────
export async function searchSkills(q: string): Promise<{ id: string; name: string; slug: string }[]> {
  if (!q || q.length < 2) return [];
  return db.skill.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    take: 12,
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function presignAvatarUpload(contentType: string) {
  const { profile } = await requireCandidate();
  const ext = contentType.split("/")[1] ?? "jpg";
  const key = objectKey(`avatars/${profile.id}`, ext);
  const { url } = await presignUpload("avatars", key, contentType);
  return { url, key, publicKey: `avatars/${key}` };
}

// ─── Privacy + résumé visibility ────────────────────────────
// Both visibility settings default to PRIVATE on a fresh profile. The user
// opts in to wider audiences from /me/profile. The AI-résumé toggle picks
// which file is served to viewers who pass the visibility gate.

const PrivacySchema = z.object({
  contactVisibility: z.enum(["PRIVATE", "CONNECTIONS", "EMPLOYERS_ONLY", "EVERYONE"]),
  resumeVisibility: z.enum(["PRIVATE", "EMPLOYERS_ONLY", "EVERYONE"]),
  useAiResume: z.coerce.boolean().default(false),
});

export async function updatePrivacySettings(formData: FormData): Promise<{ ok: boolean; message?: string }> {
  const { profile } = await requireCandidate();
  const parsed = PrivacySchema.safeParse({
    contactVisibility: formData.get("contactVisibility"),
    resumeVisibility: formData.get("resumeVisibility"),
    useAiResume: formData.get("useAiResume") === "on" || formData.get("useAiResume") === "true",
  });
  if (!parsed.success) return { ok: false, message: "Invalid visibility values." };

  await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      contactVisibility: parsed.data.contactVisibility,
      resumeVisibility: parsed.data.resumeVisibility,
      useAiResume: parsed.data.useAiResume,
    },
  });
  revalidatePath("/me/profile");
  revalidatePath(`/${profile.slug}`);
  return { ok: true, message: "Privacy settings saved." };
}
