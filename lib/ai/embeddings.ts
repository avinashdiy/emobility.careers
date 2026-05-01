import { openai, aiModels } from "@/lib/ai/openai";
import { trackAICall } from "@/lib/ai/track-cost";
import type { CandidateProfile, JobPosting } from "@prisma/client";

/**
 * Generate a single embedding vector for a piece of text.
 * Returns the raw float array (3072 dims for text-embedding-3-large).
 */
export async function embed(
  text: string,
  ctx?: { entityType?: string; entityId?: string },
): Promise<number[]> {
  const trimmed = text.trim().slice(0, 8000); // model context guard
  const res = await trackAICall(
    {
      feature: "embedding",
      model: aiModels.embedding,
      entityType: ctx?.entityType,
      entityId: ctx?.entityId,
    },
    () => openai.embeddings.create({ model: aiModels.embedding, input: trimmed }),
  );
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await trackAICall(
    { feature: "embedding-batch", model: aiModels.embedding },
    () =>
      openai.embeddings.create({
        model: aiModels.embedding,
        input: texts.map((t) => t.trim().slice(0, 8000)),
      }),
  );
  return res.data.map((d) => d.embedding);
}

/** Build the structured "profile card" string used as the embedding source. */
export function profileEmbeddingText(c: Partial<CandidateProfile> & {
  skills?: { skill: { name: string } }[];
  experiences?: { title: string; company: string; description?: string | null }[];
  evDomains?: { evDomain: { name: string } }[];
}): string {
  const parts = [
    c.headline,
    c.summary,
    c.profileMode && `Profile mode: ${c.profileMode}`,
    c.totalExperienceMonths != null && `Total experience: ${(c.totalExperienceMonths / 12).toFixed(1)} years`,
    c.location && `Location: ${c.location}`,
    c.evDomains?.length && `EV domains: ${c.evDomains.map((d) => d.evDomain.name).join(", ")}`,
    c.skills?.length && `Skills: ${c.skills.map((s) => s.skill.name).join(", ")}`,
    c.experiences?.length &&
      `Experience: ${c.experiences
        .map((e) => `${e.title} at ${e.company}${e.description ? ` — ${e.description}` : ""}`)
        .join(" | ")}`,
    c.labExposureTags?.length && `Lab exposure: ${c.labExposureTags.join(", ")}`,
  ].filter(Boolean);
  return parts.join("\n");
}

export function jobEmbeddingText(j: Partial<JobPosting> & {
  skills?: { skill: { name: string }; required: boolean }[];
  evDomains?: { evDomain: { name: string } }[];
  company?: { name: string } | null;
}): string {
  const parts = [
    j.title,
    j.company && `Company: ${j.company.name}`,
    j.profileMode && `Profile mode: ${j.profileMode}`,
    j.seniorityLevel && `Seniority: ${j.seniorityLevel}`,
    j.workMode && `Work mode: ${j.workMode}`,
    j.locations?.length && `Locations: ${j.locations.join(", ")}`,
    j.experienceMin != null && `Min experience: ${j.experienceMin} years`,
    j.evDomains?.length && `EV domains: ${j.evDomains.map((d) => d.evDomain.name).join(", ")}`,
    j.skills?.length && `Required skills: ${j.skills
      .filter((s) => s.required)
      .map((s) => s.skill.name)
      .join(", ")}`,
    j.description,
    j.responsibilities,
    j.requirements,
  ].filter(Boolean);
  return parts.join("\n");
}
