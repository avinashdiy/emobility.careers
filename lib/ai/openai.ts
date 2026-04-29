import OpenAI from "openai";
import { env } from "@/lib/env";

if (!env.OPENAI_API_KEY) {
  // Allow boot without the key — AI features will throw at call time.
  // This keeps local dev usable for non-AI workflows.
  console.warn("[ai] OPENAI_API_KEY not set — AI features will be unavailable.");
}

export const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY ?? "missing",
  // Per-request timeout — without this, a hung connection ties up a worker slot
  // forever. 60s is plenty for parser/rerank with the prompts we send.
  timeout: 60_000,
  // Limited automatic retries — BullMQ does its own retry layer for workers.
  maxRetries: 1,
});

export const aiModels = {
  parser: env.OPENAI_MODEL_PARSER,
  rerank: env.OPENAI_MODEL_RERANK,
  embedding: env.OPENAI_MODEL_EMBEDDING,
} as const;
