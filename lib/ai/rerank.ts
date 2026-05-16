import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import { z } from "zod";
import type { MatchedCandidate } from "@/server/matching/score";

const RerankResponseSchema = z.object({
  rankings: z.array(
    z.object({
      candidateId: z.string(),
      score: z.number().min(0).max(1),
      reason: z.string().max(280),
    }),
  ),
});

export interface RerankedCandidate extends MatchedCandidate {
  rerankScore: number;       // 0..1 from the LLM
  rerankReason: string;      // 1-line explanation
  combinedScore: number;     // 0..1 weighted blend with the hybrid score
}

/**
 * Re-rank the top-N hybrid matches with GPT-4o for explainability.
 * Falls back to the input order if OpenAI is unavailable.
 */
export async function rerankMatches(
  jobBrief: string,
  candidates: MatchedCandidate[],
  candidateBriefs: Map<string, string>,
  opts: { topN?: number } = {},
): Promise<RerankedCandidate[]> {
  if (!process.env.OPENAI_API_KEY || candidates.length === 0) {
    return candidates.map((c) => ({
      ...c,
      rerankScore: c.finalScore,
      rerankReason: "",
      combinedScore: c.finalScore,
    }));
  }

  const topN = opts.topN ?? 50;
  const head = candidates.slice(0, topN);
  const tail = candidates.slice(topN);

  const candidateLines = head.map(
    (c) => `[id=${c.candidateId}] ${candidateBriefs.get(c.candidateId) ?? ""}`,
  ).join("\n\n");

  const completion = await trackAICall(
    { feature: "matching.rerank", model: aiModels.rerank },
    () =>
      openai.chat.completions.create({
        model: aiModels.rerank,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a senior EV-industry recruiter. Re-rank candidates against a job brief. Return strict JSON: {rankings: [{candidateId, score (0..1), reason (≤200 chars, why this candidate fits)}]}. Higher score = better fit. Reason must be specific (skills, experience match) and avoid generic phrases.",
          },
          {
            role: "user",
            content: `JOB BRIEF:\n${jobBrief}\n\nCANDIDATES:\n${candidateLines}`,
          },
        ],
      }),
  );

  const raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  const parsed = RerankResponseSchema.safeParse(raw);
  const byId = new Map<string, { score: number; reason: string }>();
  if (parsed.success) {
    for (const r of parsed.data.rankings) byId.set(r.candidateId, r);
  }

  const enriched: RerankedCandidate[] = head.map((c) => {
    const r = byId.get(c.candidateId);
    const rerankScore = r?.score ?? c.finalScore;
    return {
      ...c,
      rerankScore,
      rerankReason: r?.reason ?? "",
      // 60% LLM rerank, 40% hybrid math — gives recruiters a stable blend.
      combinedScore: rerankScore * 0.6 + c.finalScore * 0.4,
    };
  });
  enriched.sort((a, b) => b.combinedScore - a.combinedScore);

  // Keep tail at the bottom (no rerank cost) but mark them
  const tailEnriched: RerankedCandidate[] = tail.map((c) => ({
    ...c,
    rerankScore: c.finalScore,
    rerankReason: "",
    combinedScore: c.finalScore,
  }));

  return [...enriched, ...tailEnriched];
}
