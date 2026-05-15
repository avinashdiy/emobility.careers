"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import {
  navigateInternships,
  type NavigatorResult,
  type NavigatorJobInput,
} from "@/lib/ai/internship-navigator";
import { type FormState, snapshotFormData } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";
import { EmploymentType, JobStatus, JobAudience } from "@prisma/client";

/**
 * Result returned to the client. We hand back the AI-ranked matches
 * AND the hydrated JobPosting cards so the result page can render
 * full clickable cards without re-querying — the AI's `matches[]`
 * holds the rationale (whyItFits + matchStrength) and the joined
 * `jobCards[]` holds the renderable data (title, company,
 * salary, link).
 */
export interface NavigatorJobCard {
  id: string;
  slug: string;
  title: string;
  workMode: string;
  locations: string[];
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string;
  salaryPeriod: "YEARLY" | "MONTHLY" | null;
  salaryHidden: boolean;
  company: { name: string; slug: string; logoUrl: string | null };
}

export interface InternshipNavigatorState extends FormState {
  result?: NavigatorResult;
  jobCards?: NavigatorJobCard[];
}

const schema = z.object({
  rawSkills: z.string().trim().min(2).max(2000),
  evDomainSlug: z.string().trim().max(60).optional().or(z.literal("")),
  preferredCities: z.string().trim().max(400).optional().or(z.literal("")),
  careerGoal: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function runInternshipNavigator(
  _prev: InternshipNavigatorState,
  formData: FormData,
): Promise<InternshipNavigatorState> {
  try {
    const session = await auth();
    if (!session?.user) {
      await rateLimitOrThrow("internship-nav-anon", "signupIp").catch(() => undefined);
    }

    const parsed = schema.safeParse({
      rawSkills: formData.get("rawSkills"),
      evDomainSlug: formData.get("evDomainSlug") || "",
      preferredCities: formData.get("preferredCities") || "",
      careerGoal: formData.get("careerGoal") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Tell us a few of your skills before we can navigate.",
        prevValues: snapshotFormData(formData),
      };
    }
    const data = parsed.data;
    const cities = (data.preferredCities ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 5);

    // Pull open INTERNSHIP-type postings the platform currently has.
    // We deliberately don't filter on `audience: PUBLIC` only —
    // DIYGURU_ONLY internships are absolutely something a verified
    // student should see here. The /job/<slug> page still gates
    // application; this tool just surfaces awareness.
    const rows = await db.jobPosting.findMany({
      where: {
        status: JobStatus.OPEN,
        employmentType: EmploymentType.INTERNSHIP,
        // City filter — `locations` is a String[] in the schema. We
        // accept any overlap (candidate listed Bangalore OR Pune ⇒
        // job in either qualifies). When no city given, skip the
        // filter entirely.
        ...(cities.length > 0 ? { locations: { hasSome: cities } } : {}),
        audience: { not: JobAudience.INVITE_ONLY },
      },
      orderBy: { publishedAt: "desc" },
      take: 25,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
        skills: { include: { skill: { select: { name: true } } } },
        evDomains: { include: { evDomain: { select: { slug: true } } } },
      },
    });

    // Soft re-rank: jobs in the candidate's chosen EV domain bubble
    // to the front before we hand the list to the model. The model
    // can still re-order, but we want to bias toward relevance from
    // the start.
    const ordered = data.evDomainSlug
      ? [...rows].sort((a, b) => {
          const aHas = a.evDomains.some((d) => d.evDomain.slug === data.evDomainSlug);
          const bHas = b.evDomains.some((d) => d.evDomain.slug === data.evDomainSlug);
          return aHas === bHas ? 0 : aHas ? -1 : 1;
        })
      : rows;
    const candidateJobs: NavigatorJobInput[] = ordered.slice(0, 20).map((j) => ({
      id: j.id,
      title: j.title,
      companyName: j.company.name,
      locations: j.locations,
      workMode: j.workMode,
      description: j.description,
      skillNames: j.skills.map((s) => s.skill.name),
    }));

    const result = await navigateInternships({
      rawSkills: data.rawSkills,
      evDomainSlug: data.evDomainSlug || null,
      preferredCities: cities,
      careerGoal: data.careerGoal || null,
      candidateJobs,
    });

    // Hydrate card data for whatever the model ranked. Order the
    // cards by the model's match order so the result page reads
    // top-down.
    const byId = new Map(ordered.map((j) => [j.id, j]));
    const matched = result.matches
      .map((m) => byId.get(m.jobId))
      .filter((j): j is NonNullable<typeof j> => Boolean(j))
      .map<NavigatorJobCard>((j) => ({
        id: j.id,
        slug: j.slug,
        title: j.title,
        workMode: j.workMode,
        locations: j.locations,
        salaryMin: j.salaryMin?.toString() ?? null,
        salaryMax: j.salaryMax?.toString() ?? null,
        salaryCurrency: j.salaryCurrency,
        salaryPeriod: j.salaryPeriod,
        salaryHidden: j.salaryHidden,
        company: j.company,
      }));

    return {
      ok: true,
      result,
      jobCards: matched,
      prevValues: snapshotFormData(formData),
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[internship-navigator] action failed");
    return {
      ok: false,
      message: "Couldn't navigate right now. Try again in a moment.",
      prevValues: snapshotFormData(formData),
    };
  }
}
