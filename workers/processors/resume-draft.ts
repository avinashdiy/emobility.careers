import { Worker } from "bullmq";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { s3, buckets } from "@/lib/storage";
import { QueueNames, type ResumeDraftJob } from "@/lib/queues";
import { buildResumeDraft, RESUME_DRAFT_INCLUDE } from "@/lib/ai/resume-drafter";
import { renderResumePdf } from "@/lib/pdf/resume-pdf";

/**
 * AI résumé draft worker. Triggered whenever the candidate edits experience,
 * education, skills, headline, or summary. Reads the full profile, asks the
 * LLM to polish prose into a structured draft, renders the draft to PDF
 * with `pdfkit`, uploads to MinIO, and saves the URL on the profile.
 *
 * Idempotency: BullMQ is configured with `jobId = candidateId` so multiple
 * edits in quick succession coalesce into a single PDF generation. The
 * `aiResumeGeneratedAt` timestamp is the last-write marker the user sees
 * in /me/profile.
 */
export async function processResumeDraft(job: { data: ResumeDraftJob }) {
  const { candidateId } = job.data;

  const profile = await db.candidateProfile.findUnique({
    where: { id: candidateId },
    include: RESUME_DRAFT_INCLUDE,
  });
  if (!profile) {
    logger.warn({ candidateId }, "[resume-draft] profile not found");
    return;
  }

  const draft = await buildResumeDraft(profile);
  const pdfBuffer = await renderResumePdf(draft);

  // Versioned object key — keeps history if we ever want to surface diffs.
  const key = `ai-drafts/${profile.id}/${Date.now()}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: buckets.resumes,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
      ContentDisposition: `inline; filename="resume-${profile.slug}.pdf"`,
      // Default ACL — MinIO bucket policy decides who can fetch.
    }),
  );

  // Store the bare bucket key, not a full public URL. Resumes are
  // visibility-gated and served through `/api/resume/[slug]`, which
  // generates a short-lived signed URL on demand. A pre-cooked
  // public URL would (a) leak past the visibility check and (b)
  // 404 in deployments where the resumes bucket isn't reverse-proxied
  // at the platform's domain — exactly the bug avatars hit before
  // the storage-proxy routes landed.
  await db.candidateProfile.update({
    where: { id: profile.id },
    data: { aiResumeUrl: key, aiResumeGeneratedAt: new Date() },
  });

  logger.info(
    { candidateId, key, bytes: pdfBuffer.length },
    "[resume-draft] generated",
  );
}

export function startResumeDraftWorker() {
  const worker = new Worker<ResumeDraftJob>(
    QueueNames.ResumeDraft,
    processResumeDraft,
    {
      connection: redis,
      // Bounded concurrency keeps OpenAI quota safe and avoids one runaway
      // candidate hogging the worker pool.
      concurrency: 2,
    },
  );
  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, candidateId: job?.data?.candidateId, err: err.message }, "[resume-draft] failed"),
  );
  return worker;
}
