"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { isRouterControlError } from "@/lib/server-action-errors";
import { structuredJsonCall, StructuredAIError } from "@/lib/ai/structured";
import {
  snapshotFormData,
  zodErrorsToFieldErrors,
  type FormState,
} from "@/lib/form-state";

/**
 * #14 EV Career Explorer — given a current role + skills, the AI
 * returns 6-8 adjacent EV roles with a transition score, the skill
 * gap to bridge, and 2-3 prep links. Results are cached for 30 days
 * by (role + domain + sorted-skill-csv) hash so revisits + share
 * links don't burn fresh tokens.
 *
 * No auth required to run the explorer — public viral tool. Anonymous
 * runs are still cached by hash; the user's id is recorded when
 * available so /me can show their personal exploration history.
 */

const exploreSchema = z.object({
  fromRole: z.string().trim().min(2).max(80),
  evDomainSlug: z.string().trim().max(40).optional(),
  /** Comma-separated skills the user has — "battery, lithium, BMS" */
  skillsCsv: z.string().trim().max(2000).optional(),
});

const PUBLIC_FEATURE = "wavec.career-explorer.suggest";

export interface CareerSuggestion {
  toRole: string;
  /** 0..100 — how good a fit this transition is. */
  score: number;
  /** Short reason ("you already have BMS + CAN — picking up MATLAB
   *  closes most of the gap") shown on the result card. */
  reason: string;
  /** Skills the candidate is missing to make the transition. */
  skillGap: string[];
  /** 2-3 curated prep resources — title + URL. */
  prepLinks: { title: string; url: string }[];
  /** Salary band hint, INR LPA. Loose — surfaced as "₹X-Y LPA in
   *  Bengaluru" rather than a precise number. */
  salaryBandLpa?: { min: number; max: number };
}

export interface CareerExploreResult {
  fromRole: string;
  evDomainSlug?: string;
  /** Sorted top suggestions. */
  suggestions: CareerSuggestion[];
  /** A one-paragraph executive summary the AI generated. Shown above
   *  the cards as a "here's the headline" framing line. */
  summary: string;
  /** Cache age in hours — non-zero on a cached hit. Lets the UI render
   *  "Cached from N hours ago" so a candidate who explored a few days
   *  ago doesn't think the page is broken. */
  cacheAgeHours: number;
  /** Stable cache key — also the share-link path component. */
  cacheKey: string;
}

function buildCacheKey(fromRole: string, evDomainSlug: string | null, skillsCsv: string): string {
  // Hash the normalised inputs so a tweak like "Battery Engineer" vs
  // "battery engineer" or skills in a different order doesn't bypass
  // the cache. Sorted skill set is the key to consistent hits.
  const normSkills = skillsCsv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join(",");
  const seed = `${fromRole.toLowerCase().trim()}::${evDomainSlug ?? ""}::${normSkills}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

const SYSTEM_PROMPT = `You are an EV-industry career counselor for the Indian EV market.
Given a candidate's current role + skills, suggest 6-8 adjacent EV roles
they could transition into within the next 2 years. Each suggestion
must include:
  - toRole: the target role title (e.g. "BMS Engineer", "EV Charging
    Network Operations Lead").
  - score: 0..100 indicating fit (higher = closer transition).
  - reason: 1-2 sentences citing the candidate's CURRENT strengths +
    what closes the gap.
  - skillGap: 3-5 specific skills/tools they need to add (e.g.
    "AUTOSAR", "OCPP 1.6", "ANSYS thermal").
  - prepLinks: 2-3 trusted Indian / global resources — DIYguru,
    SAEINDIA, MOOC platforms, OEM whitepapers. Use real URLs you
    are confident exist; never fabricate.
  - salaryBandLpa: { min, max } in INR LPA for the target role in
    Bengaluru/Pune/Chennai. Loose estimates are fine.

Also return a 'summary' field — one-paragraph headline of the
candidate's best-fit transition (e.g. "Your BMS + powertrain background
makes you a strong candidate for charging-controls roles, especially
at OEM electrification programmes paying ₹18-30 LPA").

Output strict JSON:
{
  "summary": "...",
  "suggestions": [
    { "toRole": "...", "score": 82, "reason": "...",
      "skillGap": ["...","..."],
      "prepLinks": [{"title":"...","url":"https://..."}],
      "salaryBandLpa": { "min": 12, "max": 22 } }
  ]
}

Suggestions array MUST be sorted by score descending. Be specific to
Indian EV market — mention companies like Ola, Ather, Tata, Mahindra,
Bosch India, Exicom where relevant.`;

export async function exploreCareer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState & { result?: CareerExploreResult }> {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const rlKey = userId ?? "anon:explorer";
    const pg = await pgRateLimit({
      action: "career-explorer.run",
      userId: rlKey,
    });
    if (!pg.ok) {
      return { ok: false, message: pg.message };
    }
    try {
      await rateLimitOrThrow(`explorer:${rlKey}`, "ai");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      return {
        ok: false,
        message: "Slow down — try again in a minute.",
        prevValues: snapshotFormData(formData),
      };
    }

    const parsed = exploreSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
        prevValues: snapshotFormData(formData),
      };
    }

    const { fromRole, evDomainSlug, skillsCsv = "" } = parsed.data;
    const cacheKey = buildCacheKey(fromRole, evDomainSlug ?? null, skillsCsv);

    // Cache lookup — 30 days, by hash. Even if the user is signed in,
    // the cache row is shared across users that happen to hash to the
    // same inputs (which is fine — the suggestion is determined by
    // inputs, not by who's asking).
    const cached = await db.careerExplorationLog.findFirst({
      where: { cacheKey, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    });
    if (cached) {
      const result = cached.result as unknown as { summary: string; suggestions: CareerSuggestion[] };
      return {
        ok: true,
        message: "Loaded from cache.",
        result: {
          fromRole,
          evDomainSlug,
          summary: result.summary,
          suggestions: result.suggestions,
          cacheAgeHours: Math.floor((Date.now() - cached.createdAt.getTime()) / (60 * 60 * 1000)),
          cacheKey,
        },
      };
    }

    // Cache miss — call OpenAI with a strict JSON schema.
    const skillsLine = skillsCsv ? `Skills they have: ${skillsCsv}.` : "";
    const domainLine = evDomainSlug ? `EV domain context: ${evDomainSlug}.` : "";
    const userPrompt = `Current role: ${fromRole}. ${domainLine} ${skillsLine}`;

    let payload: { summary: string; suggestions: CareerSuggestion[] };
    let tokensUsed = 0;
    try {
      const r = await structuredJsonCall<{ summary: string; suggestions: CareerSuggestion[] }>({
        feature: PUBLIC_FEATURE,
        system: SYSTEM_PROMPT,
        user: userPrompt,
        entityType: "CareerExploration",
        entityId: cacheKey,
        temperature: 0.4,
        maxOutputTokens: 2000,
      });
      payload = r.data;
      tokensUsed = r.tokens;
    } catch (err) {
      if (err instanceof StructuredAIError) {
        logger.warn({ feature: PUBLIC_FEATURE, cause: err.cause }, "[explore-career] structured call failed");
        return { ok: false, message: "AI is being moody — try again in a moment." };
      }
      throw err;
    }

    // Defensive normalisation — the model occasionally drifts on the
    // shape (returns numeric scores as strings, omits prepLinks, etc.).
    // We clean up rather than reject so an imperfect response still
    // delivers a usable page.
    const cleanSuggestions: CareerSuggestion[] = Array.isArray(payload.suggestions)
      ? payload.suggestions
          .map((s) => ({
            toRole: String(s.toRole ?? "").trim(),
            score: Math.max(0, Math.min(100, Number(s.score) || 0)),
            reason: String(s.reason ?? "").trim(),
            skillGap: Array.isArray(s.skillGap) ? s.skillGap.slice(0, 8).map(String) : [],
            prepLinks: Array.isArray(s.prepLinks)
              ? s.prepLinks
                  .slice(0, 4)
                  .filter((l) => l && typeof l.url === "string" && l.url.startsWith("http"))
                  .map((l) => ({ title: String(l.title ?? "Resource"), url: l.url }))
              : [],
            salaryBandLpa: s.salaryBandLpa
              && typeof s.salaryBandLpa.min === "number"
              && typeof s.salaryBandLpa.max === "number"
              ? { min: s.salaryBandLpa.min, max: s.salaryBandLpa.max }
              : undefined,
          }))
          .filter((s) => s.toRole.length > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
      : [];

    if (cleanSuggestions.length === 0) {
      return {
        ok: false,
        message: "AI didn't return useful suggestions — try a more specific role title.",
      };
    }

    const log = await db.careerExplorationLog.create({
      data: {
        userId: userId ?? null,
        fromRole,
        evDomainSlug: evDomainSlug ?? null,
        fromSkillsCsv: skillsCsv,
        // Prisma JSON columns require a plain object literal cast — the
        // generic CareerSuggestion[] type isn't an index-signature shape.
        result: {
          summary: payload.summary ?? "",
          suggestions: cleanSuggestions,
        } as unknown as Prisma.InputJsonValue,
        cacheKey,
        tokensUsed,
      },
    });

    revalidatePath("/career-explorer");

    return {
      ok: true,
      message: "Generated.",
      result: {
        fromRole,
        evDomainSlug,
        summary: payload.summary ?? "",
        suggestions: cleanSuggestions,
        cacheAgeHours: 0,
        cacheKey: log.cacheKey,
      },
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[explore-career] unexpected failure");
    return {
      ok: false,
      message: "Something went wrong — try again in a minute.",
    };
  }
}

/** Public lookup of a past exploration by cache key — drives the
 *  `/career-explorer/r/[cacheKey]` share URL. Anyone with the link can
 *  view it. */
export async function getCachedExploration(cacheKey: string): Promise<CareerExploreResult | null> {
  const row = await db.careerExplorationLog.findFirst({
    where: { cacheKey },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  const result = row.result as unknown as { summary: string; suggestions: CareerSuggestion[] };
  return {
    fromRole: row.fromRole,
    evDomainSlug: row.evDomainSlug ?? undefined,
    summary: result.summary,
    suggestions: result.suggestions,
    cacheAgeHours: Math.floor((Date.now() - row.createdAt.getTime()) / (60 * 60 * 1000)),
    cacheKey: row.cacheKey,
  };
}
