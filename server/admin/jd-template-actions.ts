"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  JDCollarType,
  JDSeniority,
  JDFunctionalArea,
  JDStatus,
  SalaryPeriod,
} from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { withUniqueSlug } from "@/lib/slug";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * CRUD + lifecycle actions for the `JobDescriptionTemplate` table —
 * the SEO-targeted role library surfaced at /jd. Admin-only.
 *
 * Form-shape design: every editor field posts as a single form
 * field. Multi-value fields (responsibilities, requirements, etc.)
 * are submitted as newline-separated textareas — see `parseLines()`
 * below for the normalisation rule.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/** Newline-delimited textarea → trimmed string[]. Empty lines are dropped. */
function parseLines(raw: FormDataEntryValue | null, max = 50): string[] {
  if (!raw) return [];
  return String(raw)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** "1.5" or "" → number | null. Treats blank as null. */
function parseOptionalFloat(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** "0" / "5" / "" → integer with sane defaults. */
function parseOptionalInt(raw: FormDataEntryValue | null, fallback: number): number {
  if (raw === null || raw === undefined) return fallback;
  const s = String(raw).trim();
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/**
 * The shared body schema for create + update. We Zod-validate the
 * classification + headline fields; the long-form arrays are
 * trusted post-`parseLines` because they're admin-only inputs and
 * empty strings would just produce empty bullets.
 */
const HeadlineSchema = z.object({
  title: z.string().trim().min(2).max(160),
  summary: z.string().trim().min(10).max(280),
  overview: z.string().trim().min(20).max(8000),
  collarType: z.nativeEnum(JDCollarType),
  seniority: z.nativeEnum(JDSeniority),
  functionalArea: z.nativeEnum(JDFunctionalArea),
  evDomainId: z.string().trim().optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(3).default("INR"),
  salaryPeriod: z.nativeEnum(SalaryPeriod).default(SalaryPeriod.YEARLY),
  reportsTo: z.string().trim().max(120).optional().nullable(),
  demandSignal: z.string().trim().max(40).optional().nullable(),
  growthOutlook: z.string().trim().max(280).optional().nullable(),
  salaryRoleQuery: z.string().trim().max(280).optional().nullable(),
  metaTitle: z.string().trim().max(160).optional().nullable(),
  metaDescription: z.string().trim().max(280).optional().nullable(),
});

/**
 * Build a `data` payload from the editor form. Used by both
 * create + update — they only differ in slug allocation + author
 * binding, which are handled in the calling action.
 */
function buildDataFromForm(formData: FormData) {
  const headline = HeadlineSchema.parse({
    title: formData.get("title"),
    summary: formData.get("summary"),
    overview: formData.get("overview"),
    collarType: formData.get("collarType"),
    seniority: formData.get("seniority"),
    functionalArea: formData.get("functionalArea"),
    evDomainId: (formData.get("evDomainId") as string | null) || null,
    salaryCurrency: ((formData.get("salaryCurrency") as string | null) || "INR").toUpperCase(),
    salaryPeriod: (formData.get("salaryPeriod") as string | null) || "YEARLY",
    reportsTo: (formData.get("reportsTo") as string | null) || null,
    demandSignal: (formData.get("demandSignal") as string | null) || null,
    growthOutlook: (formData.get("growthOutlook") as string | null) || null,
    salaryRoleQuery: (formData.get("salaryRoleQuery") as string | null) || null,
    metaTitle: (formData.get("metaTitle") as string | null) || null,
    metaDescription: (formData.get("metaDescription") as string | null) || null,
  });

  return {
    title: headline.title,
    summary: headline.summary,
    overview: headline.overview,
    collarType: headline.collarType,
    seniority: headline.seniority,
    functionalArea: headline.functionalArea,
    evDomainId: headline.evDomainId || null,
    salaryCurrency: headline.salaryCurrency,
    salaryPeriod: headline.salaryPeriod,
    reportsTo: headline.reportsTo || null,
    demandSignal: headline.demandSignal || null,
    growthOutlook: headline.growthOutlook || null,
    salaryRoleQuery: headline.salaryRoleQuery || null,
    metaTitle: headline.metaTitle || null,
    metaDescription: headline.metaDescription || null,
    alternativeTitles: parseLines(formData.get("alternativeTitles"), 20),
    typicalCompanies: parseLines(formData.get("typicalCompanies"), 20),
    typicalIndustries: parseLines(formData.get("typicalIndustries"), 20),
    responsibilities: parseLines(formData.get("responsibilities"), 20),
    requirements: parseLines(formData.get("requirements"), 20),
    preferredQualifications: parseLines(formData.get("preferredQualifications"), 20),
    keySkills: parseLines(formData.get("keySkills"), 30),
    tools: parseLines(formData.get("tools"), 30),
    certifications: parseLines(formData.get("certifications"), 20),
    careerPath: parseLines(formData.get("careerPath"), 12),
    reports: parseLines(formData.get("reports"), 20),
    sampleInterviewQuestions: parseLines(formData.get("sampleInterviewQuestions"), 20),
    experienceMinYears: parseOptionalInt(formData.get("experienceMinYears"), 0),
    experienceMaxYears: parseOptionalInt(formData.get("experienceMaxYears"), 2),
    salaryMinLakhs: parseOptionalFloat(formData.get("salaryMinLakhs")),
    salaryMedianLakhs: parseOptionalFloat(formData.get("salaryMedianLakhs")),
    salaryMaxLakhs: parseOptionalFloat(formData.get("salaryMaxLakhs")),
    remoteFriendly: formData.get("remoteFriendly") === "on" || formData.get("remoteFriendly") === "true",
  } as const;
}

/**
 * Create a new JD template. Slug is auto-allocated from the title
 * via `withUniqueSlug`. Status defaults to DRAFT — admin opens the
 * created row in the editor to review before publishing.
 */
export async function createJDTemplate(formData: FormData): Promise<void> {
  let createdId: string | null = null;
  try {
    const session = await requireAdmin();
    const data = buildDataFromForm(formData);

    const created = await withUniqueSlug(data.title, (slug) =>
      db.jobDescriptionTemplate.create({
        data: {
          slug,
          ...data,
          status: JDStatus.DRAFT,
          authorId: session.user.id,
        },
        select: { id: true, slug: true },
      }),
    );
    createdId = created.id;

    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.create",
        entity: "JobDescriptionTemplate",
        entityId: created.id,
        meta: { slug: created.slug, title: data.title },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[createJDTemplate] failed");
    redirect(
      "/admin/jd-templates/new?error=" +
        encodeURIComponent(err instanceof Error ? err.message : "Save failed."),
    );
  }
  // Redirect outside the try/catch — `redirect` throws a control
  // error that Next consumes; doing it inside try would log noise.
  if (createdId) redirect(`/admin/jd-templates/${createdId}?notice=Created`);
}

/**
 * Update every editable field on an existing row. Status changes
 * route through the dedicated publish/archive actions below — this
 * action preserves the current status.
 */
export async function updateJDTemplate(formData: FormData): Promise<void> {
  let templateId: string | null = null;
  try {
    const session = await requireAdmin();
    templateId = z.string().min(1).parse(formData.get("id"));
    const data = buildDataFromForm(formData);

    await db.jobDescriptionTemplate.update({
      where: { id: templateId },
      data,
      select: { id: true, slug: true },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.update",
        entity: "JobDescriptionTemplate",
        entityId: templateId,
        meta: { title: data.title },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
    revalidatePath(`/admin/jd-templates/${templateId}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err, templateId }, "[updateJDTemplate] failed");
    redirect(
      `/admin/jd-templates/${templateId ?? ""}?error=` +
        encodeURIComponent(err instanceof Error ? err.message : "Save failed."),
    );
  }
  if (templateId) redirect(`/admin/jd-templates/${templateId}?notice=Saved`);
}

/**
 * Publish action — flips status to PUBLISHED and stamps
 * publishedAt the first time the row is published (subsequent
 * publishes preserve the original date so changefreq on the
 * sitemap stays honest).
 */
export async function publishJDTemplate(formData: FormData): Promise<void> {
  let templateId: string | null = null;
  try {
    const session = await requireAdmin();
    templateId = z.string().min(1).parse(formData.get("id"));

    const current = await db.jobDescriptionTemplate.findUnique({
      where: { id: templateId },
      select: { slug: true, publishedAt: true },
    });
    if (!current) {
      redirect("/admin/jd-templates?error=Template not found");
    }

    await db.jobDescriptionTemplate.update({
      where: { id: templateId },
      data: {
        status: JDStatus.PUBLISHED,
        publishedAt: current.publishedAt ?? new Date(),
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.publish",
        entity: "JobDescriptionTemplate",
        entityId: templateId,
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
    if (current?.slug) revalidatePath(`/jd/${current.slug}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err, templateId }, "[publishJDTemplate] failed");
    redirect(
      `/admin/jd-templates/${templateId ?? ""}?error=` +
        encodeURIComponent("Publish failed"),
    );
  }
  if (templateId) redirect(`/admin/jd-templates/${templateId}?notice=Published`);
}

export async function unpublishJDTemplate(formData: FormData): Promise<void> {
  let templateId: string | null = null;
  try {
    const session = await requireAdmin();
    templateId = z.string().min(1).parse(formData.get("id"));
    const current = await db.jobDescriptionTemplate.findUnique({
      where: { id: templateId },
      select: { slug: true },
    });
    await db.jobDescriptionTemplate.update({
      where: { id: templateId },
      data: { status: JDStatus.DRAFT },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.unpublish",
        entity: "JobDescriptionTemplate",
        entityId: templateId,
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
    if (current?.slug) revalidatePath(`/jd/${current.slug}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err, templateId }, "[unpublishJDTemplate] failed");
    redirect(
      `/admin/jd-templates/${templateId ?? ""}?error=Unpublish failed`,
    );
  }
  if (templateId) redirect(`/admin/jd-templates/${templateId}?notice=Moved to draft`);
}

export async function archiveJDTemplate(formData: FormData): Promise<void> {
  let templateId: string | null = null;
  try {
    const session = await requireAdmin();
    templateId = z.string().min(1).parse(formData.get("id"));
    const current = await db.jobDescriptionTemplate.findUnique({
      where: { id: templateId },
      select: { slug: true },
    });
    await db.jobDescriptionTemplate.update({
      where: { id: templateId },
      data: { status: JDStatus.ARCHIVED },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.archive",
        entity: "JobDescriptionTemplate",
        entityId: templateId,
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
    if (current?.slug) revalidatePath(`/jd/${current.slug}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err, templateId }, "[archiveJDTemplate] failed");
    redirect(
      `/admin/jd-templates/${templateId ?? ""}?error=Archive failed`,
    );
  }
  if (templateId) redirect("/admin/jd-templates?notice=Archived");
}

export async function deleteJDTemplate(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const id = z.string().min(1).parse(formData.get("id"));
    const tpl = await db.jobDescriptionTemplate.findUnique({
      where: { id },
      select: { slug: true, title: true },
    });
    if (!tpl) redirect("/admin/jd-templates?error=Template not found");
    await db.jobDescriptionTemplate.delete({ where: { id } });
    try {
      await audit({
        actorId: session.user.id,
        action: "jd_template.delete",
        entity: "JobDescriptionTemplate",
        entityId: id,
        meta: { slug: tpl!.slug, title: tpl!.title },
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/jd-templates");
    revalidatePath("/jd");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[deleteJDTemplate] failed");
    redirect("/admin/jd-templates?error=Delete failed");
  }
  redirect("/admin/jd-templates?notice=Deleted");
}
