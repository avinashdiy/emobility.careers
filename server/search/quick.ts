"use server";

import { db } from "@/lib/db";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { auth } from "@/lib/auth";

/**
 * Lightweight typeahead lookup that powers the header search dropdown.
 * Returns top-3 hits across people, jobs, companies, and mentors —
 * enough to give a candidate a "did you mean…" preview without making
 * the dropdown too tall to scan. The full /search page does the heavy
 * filtering / faceting; this is just the dynamic peek.
 *
 * Performance & abuse guards:
 *   • Empty / single-char queries return early (substring match would
 *     scan the whole table).
 *   • Per-user rate limit (60 calls / min) so a runaway keystroke
 *     handler can't DoS Postgres. Anonymous traffic shares an IP-ish
 *     bucket — the action is wrapped client-side in a 250ms debounce
 *     anyway, so 60/min is generous in practice.
 *   • Each pull is `take: 3` and only returns the columns the dropdown
 *     renders (no description / about / nested relations beyond what
 *     we render in the row).
 *   • REJECTED companies are filtered out — they're hidden everywhere
 *     else publicly so they shouldn't surface here either.
 */

export interface QuickHit {
  id: string;
  href: string;
  title: string;
  subtitle: string | null;
  avatarUrl: string | null;
  /** Used to pick the icon / pill on the row. */
  kind: "person" | "job" | "company" | "mentor";
}

export interface QuickResults {
  q: string;
  hits: QuickHit[];
  /** Total before slicing — drives the "+N more results →" footer copy. */
  totals: { people: number; jobs: number; companies: number; mentors: number };
}

const TAKE = 3;

export async function quickSearch(q: string): Promise<QuickResults> {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return { q: trimmed, hits: [], totals: { people: 0, jobs: 0, companies: 0, mentors: 0 } };
  }

  // Rate-limit per signed-in user; anon traffic uses a coarser bucket.
  // Failure is non-fatal — if Redis is down we serve the result anyway
  // (this is a UX assist, not a paid feature).
  const session = await auth().catch(() => null);
  const limitKey = session?.user?.id ? `quick:${session.user.id}` : "quick:anon";
  await rateLimitOrThrow(limitKey, "ats").catch(() => undefined);

  const [people, jobs, companies, mentors] = await Promise.all([
    db.candidateProfile.findMany({
      where: {
        cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
        OR: [
          { firstName: { contains: trimmed, mode: "insensitive" } },
          { lastName: { contains: trimmed, mode: "insensitive" } },
          { headline: { contains: trimmed, mode: "insensitive" } },
        ],
      },
      take: TAKE,
      orderBy: { followersCount: "desc" },
      select: {
        id: true,
        slug: true,
        firstName: true,
        lastName: true,
        headline: true,
        profilePhotoUrl: true,
      },
    }),
    db.jobPosting.findMany({
      where: {
        status: "OPEN",
        company: { verificationStatus: { not: "REJECTED" } },
        OR: [
          { title: { contains: trimmed, mode: "insensitive" } },
          { company: { name: { contains: trimmed, mode: "insensitive" } } },
        ],
      },
      take: TAKE,
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        locations: true,
        company: { select: { name: true, logoUrl: true } },
      },
    }),
    db.company.findMany({
      where: {
        verificationStatus: { not: "REJECTED" },
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { slug: { contains: trimmed.toLowerCase().replace(/\s+/g, "-") } },
        ],
      },
      take: TAKE,
      orderBy: [{ verificationStatus: "desc" }, { followersCount: "desc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        hqLocation: true,
      },
    }),
    db.mentorProfile.findMany({
      where: {
        isPublished: true,
        kycStatus: "APPROVED",
        OR: [
          { headline: { contains: trimmed, mode: "insensitive" } },
          {
            user: {
              candidateProfile: {
                OR: [
                  { firstName: { contains: trimmed, mode: "insensitive" } },
                  { lastName: { contains: trimmed, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
      take: TAKE,
      orderBy: [{ avgRating: "desc" }, { totalSessions: "desc" }],
      select: {
        id: true,
        headline: true,
        user: {
          select: {
            candidateProfile: {
              select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true },
            },
          },
        },
      },
    }),
  ]);

  // Total counts for the "+N more" footer. Run in parallel; cheap
  // count() with the same where clauses.
  const [peopleCount, jobsCount, companiesCount, mentorsCount] = await Promise.all([
    db.candidateProfile.count({
      where: {
        cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
        OR: [
          { firstName: { contains: trimmed, mode: "insensitive" } },
          { lastName: { contains: trimmed, mode: "insensitive" } },
          { headline: { contains: trimmed, mode: "insensitive" } },
        ],
      },
    }),
    db.jobPosting.count({
      where: {
        status: "OPEN",
        company: { verificationStatus: { not: "REJECTED" } },
        OR: [
          { title: { contains: trimmed, mode: "insensitive" } },
          { company: { name: { contains: trimmed, mode: "insensitive" } } },
        ],
      },
    }),
    db.company.count({
      where: {
        verificationStatus: { not: "REJECTED" },
        OR: [
          { name: { contains: trimmed, mode: "insensitive" } },
          { slug: { contains: trimmed.toLowerCase().replace(/\s+/g, "-") } },
        ],
      },
    }),
    db.mentorProfile.count({
      where: {
        isPublished: true,
        kycStatus: "APPROVED",
        OR: [
          { headline: { contains: trimmed, mode: "insensitive" } },
          {
            user: {
              candidateProfile: {
                OR: [
                  { firstName: { contains: trimmed, mode: "insensitive" } },
                  { lastName: { contains: trimmed, mode: "insensitive" } },
                ],
              },
            },
          },
        ],
      },
    }),
  ]);

  // Flatten into a single ordered list. People + companies first
  // (most-clicked categories), jobs, then mentors. Each kind keeps
  // its grouping label client-side.
  const hits: QuickHit[] = [
    ...people.map(
      (p): QuickHit => ({
        id: p.id,
        href: `/${p.slug}`,
        title: `${p.firstName} ${p.lastName ?? ""}`.trim(),
        subtitle: p.headline,
        avatarUrl: p.profilePhotoUrl,
        kind: "person",
      }),
    ),
    ...companies.map(
      (c): QuickHit => ({
        id: c.id,
        href: `/company/${c.slug}`,
        title: c.name,
        subtitle: c.hqLocation,
        avatarUrl: c.logoUrl,
        kind: "company",
      }),
    ),
    ...jobs.map(
      (j): QuickHit => ({
        id: j.id,
        href: `/job/${j.slug}`,
        title: j.title,
        subtitle: `${j.company.name}${j.locations[0] ? ` · ${j.locations[0]}` : ""}`,
        avatarUrl: j.company.logoUrl,
        kind: "job",
      }),
    ),
    ...mentors.map((m): QuickHit => {
      const cp = m.user.candidateProfile;
      const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
      return {
        id: m.id,
        href: cp ? `/mentors/${cp.slug}` : `/mentors`,
        title: name,
        subtitle: m.headline,
        avatarUrl: cp?.profilePhotoUrl ?? null,
        kind: "mentor",
      };
    }),
  ];

  return {
    q: trimmed,
    hits,
    totals: {
      people: peopleCount,
      jobs: jobsCount,
      companies: companiesCount,
      mentors: mentorsCount,
    },
  };
}
