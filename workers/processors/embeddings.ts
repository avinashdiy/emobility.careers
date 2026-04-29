import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { embed, profileEmbeddingText, jobEmbeddingText } from "@/lib/ai/embeddings";
import { QueueNames, type EmbeddingsJob } from "@/lib/queues";

export function startEmbeddingsWorker() {
  const worker = new Worker<EmbeddingsJob>(
    QueueNames.Embeddings,
    async (job) => {
      if (job.data.kind === "candidate") {
        const profile = await db.candidateProfile.findUnique({
          where: { id: job.data.candidateId },
          include: {
            skills: { include: { skill: true } },
            experiences: true,
            evDomains: { include: { evDomain: true } },
          },
        });
        if (!profile) return { ok: false, reason: "not-found" };

        const text = profileEmbeddingText(profile);
        if (!text.trim()) return { ok: false, reason: "empty" };

        const vector = await embed(text);
        // Defense in depth: validate the embedding is purely numeric before
        // serialising — even though Prisma binds it as a single $1 parameter,
        // we guard against any future change to the call shape.
        if (!Array.isArray(vector) || vector.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
          throw new Error("invalid embedding vector");
        }
        const literal = `[${vector.join(",")}]`;
        await db.$executeRaw`
          UPDATE "CandidateProfile"
          SET "profileEmbedding" = ${literal}::vector
          WHERE id = ${profile.id}
        `;
        logger.info({ candidateId: profile.id }, "[embeddings] candidate updated");
        return { ok: true };
      }

      if (job.data.kind === "job") {
        const job_ = await db.jobPosting.findUnique({
          where: { id: job.data.jobId },
          include: {
            skills: { include: { skill: true } },
            evDomains: { include: { evDomain: true } },
            company: true,
          },
        });
        if (!job_) return { ok: false, reason: "not-found" };

        const text = jobEmbeddingText(job_);
        if (!text.trim()) return { ok: false, reason: "empty" };

        const vector = await embed(text);
        if (!Array.isArray(vector) || vector.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
          throw new Error("invalid embedding vector");
        }
        const literal = `[${vector.join(",")}]`;
        await db.$executeRaw`
          UPDATE "JobPosting"
          SET "jdEmbedding" = ${literal}::vector
          WHERE id = ${job_.id}
        `;
        logger.info({ jobId: job_.id }, "[embeddings] job updated");
        return { ok: true };
      }

      return { ok: false, reason: "unknown-kind" };
    },
    { connection: redis, concurrency: 4 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[embeddings] failed"),
  );

  return worker;
}
