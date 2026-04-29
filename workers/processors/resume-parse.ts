import { Worker } from "bullmq";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { s3 } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { parseResume } from "@/lib/ai/resume-parser";
import { embeddingsQueue, QueueNames, type ResumeParseJob } from "@/lib/queues";

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export function startResumeParseWorker() {
  const worker = new Worker<ResumeParseJob>(
    QueueNames.ResumeParse,
    async (job) => {
      const { candidateId, bucket, key, mimeType } = job.data;
      logger.info({ jobId: job.id, candidateId, key }, "[resume-parse] start");

      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const buffer = await streamToBuffer(obj.Body as Readable);

      const parsed = await parseResume(buffer, mimeType);

      await db.candidateProfile.update({
        where: { id: candidateId },
        data: {
          resumeParseDraft: parsed,
          resumeParsedAt: new Date(),
          ...(parsed.detectedDIYguru
            ? { labExposureTags: { push: "diyguru-mentioned" } }
            : {}),
        },
      });

      await embeddingsQueue.add("candidate", { kind: "candidate", candidateId });

      logger.info({ candidateId }, "[resume-parse] done");
      return { ok: true };
    },
    { connection: redis, concurrency: 2 },
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, "[resume-parse] failed"),
  );

  return worker;
}
