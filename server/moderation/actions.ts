"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { JobReportReason, JobReportStatus, JobStatus } from "@prisma/client";

// ─── Public: report a job ───────────────────────────────────

const reportSchema = z.object({
  jobId: z.string(),
  reason: z.nativeEnum(JobReportReason),
  details: z.string().max(2000).optional(),
});

export async function reportJob(formData: FormData) {
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/jobs?error=" + encodeURIComponent("Invalid report"));
  }
  const session = await auth();
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;

  // Rate-limit by IP (logged-out) or user
  const limitKey = session?.user?.id ?? ip ?? "anon";
  await rateLimitOrThrow(`report:${limitKey}`, "saveItem");

  await db.jobReport.create({
    data: {
      jobId: parsed.data.jobId,
      reporterUserId: session?.user?.id ?? null,
      reason: parsed.data.reason,
      details: parsed.data.details || null,
      ip,
    },
  });

  // If a job accumulates ≥3 open reports, auto-pause for admin review
  const openCount = await db.jobReport.count({
    where: { jobId: parsed.data.jobId, status: JobReportStatus.OPEN },
  });
  if (openCount >= 3) {
    await db.jobPosting.updateMany({
      where: { id: parsed.data.jobId, status: JobStatus.OPEN },
      data: { status: JobStatus.PENDING_REVIEW },
    });
    await audit({
      action: "job.auto_paused",
      entity: "JobPosting",
      entityId: parsed.data.jobId,
      meta: { reason: "report-threshold", count: openCount },
    });
  }

  redirect(
    `/jobs/${parsed.data.jobId}?notice=` +
      encodeURIComponent("Thanks — our team will review this report."),
  );
}

// ─── Admin: review reports ──────────────────────────────────

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function dismissReport(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const notes = String(formData.get("notes") ?? "").slice(0, 500) || null;
  await db.jobReport.update({
    where: { id },
    data: {
      status: JobReportStatus.DISMISSED,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewerNotes: notes,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "report.dismissed",
    entity: "JobReport",
    entityId: id,
  });
  revalidatePath("/admin/reports");
}

export async function actionReport(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const action = z.enum(["close-job", "pause-job"]).parse(formData.get("action"));
  const notes = String(formData.get("notes") ?? "").slice(0, 500) || null;

  const report = await db.jobReport.findUnique({ where: { id } });
  if (!report) return;

  await db.$transaction([
    db.jobReport.update({
      where: { id },
      data: {
        status: JobReportStatus.ACTIONED,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        reviewerNotes: notes,
      },
    }),
    // Mark all other open reports for the same job as REVIEWED
    db.jobReport.updateMany({
      where: { jobId: report.jobId, status: JobReportStatus.OPEN, id: { not: id } },
      data: {
        status: JobReportStatus.REVIEWED,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    }),
    db.jobPosting.update({
      where: { id: report.jobId },
      data: { status: action === "close-job" ? JobStatus.CLOSED : JobStatus.PAUSED },
    }),
  ]);

  await audit({
    actorId: session.user.id,
    action: action === "close-job" ? "job.closed_by_moderation" : "job.paused_by_moderation",
    entity: "JobPosting",
    entityId: report.jobId,
    meta: { reportId: id },
  });

  // Withdraw the listing from search engines.
  const { pingIndexNow, pingGoogleIndexing } = await import("@/lib/seo/indexnow");
  const url = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")}/jobs/${report.jobId}`;
  void pingIndexNow(url);
  void pingGoogleIndexing(url, "URL_DELETED");

  revalidatePath("/admin/reports");
  revalidatePath("/admin/jobs");
  revalidatePath("/jobs.xml");
  revalidatePath("/sitemap-jobs.xml");
}

// ─── Public: report a social post ───────────────────────────
//
// We piggy-back on the AuditLog table for post reports rather than
// adding a dedicated PostReport schema. Justification: post-report
// volume will be small (orders of magnitude lower than job apps),
// the data we need (postId, reason, reporter, status) all fits in
// AuditLog's existing columns + meta JSON, and we get the audit-log
// page's existing filters / pagination for free. If post moderation
// becomes a high-volume workflow later we can lift this into its
// own table without changing the public-facing reportPost contract.

const POST_REPORT_REASONS = [
  "SPAM",
  "HARASSMENT",
  "MISINFORMATION",
  "INAPPROPRIATE",
  "HATE_SPEECH",
  "OFF_TOPIC",
  "OTHER",
] as const;

const reportPostSchema = z.object({
  postId: z.string(),
  reason: z.enum(POST_REPORT_REASONS),
  details: z.string().max(2000).optional(),
});

export async function reportPost(formData: FormData): Promise<{
  ok: boolean;
  message: string;
}> {
  const parsed = reportPostSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Pick a reason and try again." };
  }
  const session = await auth();
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null;

  // Reuse the same rate-limit bucket as job reports — same risk profile,
  // same abuse model.
  const limitKey = session?.user?.id ?? ip ?? "anon";
  await rateLimitOrThrow(`report:${limitKey}`, "saveItem");

  // Cheap existence check before logging — we don't want a queue full
  // of reports against deleted posts.
  const post = await db.post.findUnique({
    where: { id: parsed.data.postId },
    select: { id: true, authorId: true },
  });
  if (!post) {
    return { ok: false, message: "That post no longer exists." };
  }

  await audit({
    actorId: session?.user?.id ?? null,
    action: "post.flagged",
    entity: "Post",
    entityId: post.id,
    meta: {
      reason: parsed.data.reason,
      details: parsed.data.details ?? null,
      authorId: post.authorId,
      // Status lives in meta so dismiss/action handlers can flip it
      // without losing the original report context. Default OPEN; the
      // /admin/post-reports queue filters on this.
      status: "OPEN",
    },
    ip,
  });

  return {
    ok: true,
    message: "Thanks — our team will review this report.",
  };
}

// ─── Admin: act on a post report ────────────────────────────

export async function actionPostReport(formData: FormData) {
  const session = await requireAdmin();
  const auditId = z.string().parse(formData.get("auditId"));
  const action = z
    .enum(["remove-post", "dismiss"])
    .parse(formData.get("action"));
  const notes = String(formData.get("notes") ?? "").slice(0, 500) || null;

  const entry = await db.auditLog.findUnique({
    where: { id: auditId },
    select: { id: true, entity: true, entityId: true, meta: true },
  });
  if (!entry || entry.entity !== "Post" || !entry.entityId) {
    redirect("/admin/post-reports?error=" + encodeURIComponent("Report not found"));
  }

  // Stamp the original audit row's meta with reviewer info so the queue
  // can hide it on subsequent loads. Spread to keep the original report
  // payload (reason, details, ...) intact.
  const baseMeta =
    entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta)
      ? (entry.meta as Record<string, unknown>)
      : {};

  await db.auditLog.update({
    where: { id: entry.id },
    data: {
      meta: {
        ...baseMeta,
        status: action === "dismiss" ? "DISMISSED" : "ACTIONED",
        reviewedById: session.user.id,
        reviewedAt: new Date().toISOString(),
        reviewerNotes: notes,
      },
    },
  });

  if (action === "remove-post") {
    // Soft-removal: flip visibility to PRIVATE so the post disappears
    // from public/connections feeds but stays around for the author's
    // record + appeal flow. Also drops the post out of the embedding
    // index implicitly because feed queries filter by visibility.
    await db.post.update({
      where: { id: entry.entityId },
      data: { visibility: "PRIVATE" },
    });
    await audit({
      actorId: session.user.id,
      action: "post.removed_by_moderation",
      entity: "Post",
      entityId: entry.entityId,
      meta: { sourceReportId: entry.id, notes },
    });
  }

  revalidatePath("/admin/post-reports");
  revalidatePath(`/posts/${entry.entityId}`);
  revalidatePath("/feed");
}
