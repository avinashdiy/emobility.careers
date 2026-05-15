import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import { CandidateSearchList, type SearchCandidate } from "@/components/employer/CandidateSearchList";
import { PageHeader } from "@/components/ui/page-header";
import { parseBooleanQuery } from "@/lib/search/boolean";

export const metadata = { title: "Search candidates" };

/**
 * Recruiter talent search. Server component does the filtering + sort
 * via Prisma; the result list is a client component so we can hold
 * multi-select state for bulk InMail without re-fetching.
 *
 * Sort options:
 *   - relevance (default) — recently updated profiles first.
 *   - active             — recently logged-in users first (LinkedIn's
 *                          "Recently active" recruiter sort).
 *   - experienced        — most years of experience first.
 *
 * The `lastActive` filter is a coarse band (1 / 7 / 30 / 90 days).
 * We store login on `User.lastLoginAt`, set on every successful sign-in
 * inside Credentials.authorize.
 */
export default async function TalentSearch({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    domain?: string;
    profileMode?: string;
    diyguruOnly?: string;
    openToWork?: string;
    lastActive?: string; // "1d" | "7d" | "30d" | "90d"
    sort?: string;       // "relevance" | "active" | "experienced"
    // Wave C #28 — recruiter filter "verified in this skill". One
    // slug only for now (most common case); multi-select TBD when
    // we see it requested.
    verifiedSkill?: string;
    // Wave C #29 — credential filter on candidate side.
    credential?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const sp = await searchParams;

  // Boolean query parsing — `(battery OR powertrain) AND "3 years" AND
  // Bengaluru NOT intern`. We AND the parsed clause into the visibility
  // filter so the existing facet checkboxes still apply on top.
  // `parseBooleanQuery` is parser-only — Prisma still does the actual
  // matching, so there's no SQL-injection surface here.
  const parsed = sp.q ? parseBooleanQuery(sp.q) : { where: {}, normalized: "" };
  const where: Prisma.CandidateProfileWhereInput = {
    cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
    ...parsed.where,
  };
  if (sp.domain) {
    where.evDomains = { some: { evDomain: { slug: sp.domain } } };
  }
  if (sp.profileMode) where.profileMode = sp.profileMode as Prisma.CandidateProfileWhereInput["profileMode"];
  if (sp.diyguruOnly === "true") where.isDIYguruVerified = true;
  if (sp.openToWork === "true") where.openToWork = true;
  // Wave C #28 — verified-skill filter
  if (sp.verifiedSkill) {
    where.verifiedSkillBadges = {
      some: { meta: { slug: sp.verifiedSkill } },
    };
  }
  // Wave C #29 — candidate-side credential filter
  if (sp.credential) {
    where.credentialsHeld = {
      some: { credential: { slug: sp.credential } },
    };
  }

  // "Last active in" — User.lastLoginAt drives this. The cutoff converts
  // band → ms, then filters via the User relation. We pull lastLoginAt
  // alongside the candidate row for the per-card pill.
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff =
    sp.lastActive === "1d" ? new Date(Date.now() - dayMs)
    : sp.lastActive === "7d" ? new Date(Date.now() - 7 * dayMs)
    : sp.lastActive === "30d" ? new Date(Date.now() - 30 * dayMs)
    : sp.lastActive === "90d" ? new Date(Date.now() - 90 * dayMs)
    : null;
  if (cutoff) {
    where.user = { lastLoginAt: { gte: cutoff } };
  }

  const sort = sp.sort ?? "relevance";
  const orderBy: Prisma.CandidateProfileOrderByWithRelationInput[] =
    sort === "active" ? [{ user: { lastLoginAt: "desc" } }, { updatedAt: "desc" }]
    : sort === "experienced" ? [{ totalExperienceMonths: "desc" }, { updatedAt: "desc" }]
    : [{ updatedAt: "desc" }];

  const candidates = await db.candidateProfile.findMany({
    where,
    take: 50,
    orderBy,
    include: {
      evDomains: { include: { evDomain: { select: { slug: true, name: true } } } },
      skills: { include: { skill: { select: { id: true, name: true } } }, take: 6 },
      user: { select: { lastLoginAt: true, phone: true } },
    },
  });

  // ─── Contact-privacy gate (LinkedIn-strict) ──────────────────────
  // Phone is forwarded ONLY when:
  //   • candidate set contactVisibility = EVERYONE (rare opt-in), OR
  //   • candidate set contactVisibility = EMPLOYERS_ONLY AND has at
  //     least one Application to a job at THIS recruiter's company.
  // The "applied to this company" check is what distinguishes us
  // from the previous loose policy that leaked phone to any employer
  // browsing the search page. We do it once with a single batch
  // query: collect the candidate ids on the page, look up which ones
  // have an application to a job at the recruiter's company, then
  // gate per-row.
  const candidateIds = candidates.map((c) => c.id);
  const candidatesWithApplication = candidateIds.length
    ? await db.application.findMany({
        where: {
          candidateId: { in: candidateIds },
          job: { companyId: employer.companyId },
        },
        select: { candidateId: true },
      })
    : [];
  const appliedSet = new Set(candidatesWithApplication.map((a) => a.candidateId));

  const [evDomains, skillOptions, credentialOptions] = await Promise.all([
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
    // Wave C #28 — populate the verified-skill dropdown
    db.skillAssessmentMeta.findMany({
      where: { isPublic: true },
      orderBy: [{ evDomainSlug: "asc" }, { sortOrder: "asc" }],
      select: {
        slug: true,
        assessment: { select: { title: true } },
      },
    }).then((rows) => rows.map((r) => ({ slug: r.slug, title: r.assessment.title }))),
    // Wave C #29 — populate the credential dropdown
    db.credential.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
  ]);

  const rows: SearchCandidate[] = candidates.map((c) => {
    const phoneVisible =
      c.contactVisibility === "EVERYONE" ||
      (c.contactVisibility === "EMPLOYERS_ONLY" && appliedSet.has(c.id));
    return {
      id: c.id,
      slug: c.slug,
      firstName: c.firstName,
      lastName: c.lastName,
      headline: c.headline,
      profilePhotoUrl: c.profilePhotoUrl,
      isDIYguruVerified: c.isDIYguruVerified,
      openToWork: c.openToWork,
      profileMode: c.profileMode,
      location: c.location,
      totalExperienceMonths: c.totalExperienceMonths,
      lastActiveAt: c.user.lastLoginAt ? c.user.lastLoginAt.getTime() : null,
      phone: phoneVisible ? c.phone ?? c.user.phone ?? null : null,
      evDomains: c.evDomains.map((d) => ({ evDomain: d.evDomain })),
      skills: c.skills.map((s) => ({ skill: s.skill })),
    };
  });

  return (
    <EmployerShell>
      <div className="container max-w-6xl py-10">
        <PageHeader
          title="Candidate search"
          subtitle="Search the public talent network. Tick candidates to message a shortlist in one click. Use AI matching from a job for ranked recommendations."
        />

        <Card className="mt-6 p-4">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder='Boolean: (battery OR powertrain) AND "3 years" AND Bengaluru'
                aria-describedby="boolean-help"
              />
              <p id="boolean-help" className="mt-1 text-hint text-emce-text-muted">
                Boolean: <code className="rounded bg-emce-light-soft px-1 py-0.5 font-mono">AND</code>{" "}
                <code className="rounded bg-emce-light-soft px-1 py-0.5 font-mono">OR</code>{" "}
                <code className="rounded bg-emce-light-soft px-1 py-0.5 font-mono">NOT</code>{" "}
                · quoted phrases · parens
                {parsed.normalized && parsed.normalized !== sp.q && (
                  <>
                    {" · parsed as "}
                    <code className="rounded bg-emce-light-soft px-1 py-0.5 font-mono">
                      {parsed.normalized}
                    </code>
                  </>
                )}
              </p>
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="domain" defaultValue={sp.domain ?? ""}>
                <option value="">Any domain</option>
                {evDomains.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="profileMode" defaultValue={sp.profileMode ?? ""}>
                <option value="">Any mode</option>
                <option value="FRESHER">Fresher</option>
                <option value="EXPERIENCED">Experienced</option>
                <option value="TECHNICIAN">Technician</option>
                <option value="LEADERSHIP">Leadership</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Search</Button>
            </div>

            {/* Recently-active filter — narrows the result set to logins
                within the band. Empty string = "any". */}
            <div className="sm:col-span-3">
              <NativeSelect name="lastActive" defaultValue={sp.lastActive ?? ""}>
                <option value="">Active anytime</option>
                <option value="1d">Active in last 24h</option>
                <option value="7d">Active in last 7 days</option>
                <option value="30d">Active in last 30 days</option>
                <option value="90d">Active in last 90 days</option>
              </NativeSelect>
            </div>

            {/* Sort selector */}
            <div className="sm:col-span-3">
              <NativeSelect name="sort" defaultValue={sp.sort ?? "relevance"}>
                <option value="relevance">Sort: Relevance</option>
                <option value="active">Sort: Recently active</option>
                <option value="experienced">Sort: Most experienced</option>
              </NativeSelect>
            </div>

            <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
              <input type="checkbox" name="diyguruOnly" value="true" defaultChecked={sp.diyguruOnly === "true"} className="h-4 w-4 accent-emce-mid" />
              DIYguru-verified only
            </label>
            <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
              <input type="checkbox" name="openToWork" value="true" defaultChecked={sp.openToWork === "true"} className="h-4 w-4 accent-emce-mid" />
              Open to work only
            </label>

            {/* Wave C #28 + #29 — verified-skill + credential filters.
                These hit the same form-submit. We load the option lists
                from the DB once via the parent layout call below so
                the dropdowns aren't stale. */}
            <div className="sm:col-span-3">
              <NativeSelect name="verifiedSkill" defaultValue={sp.verifiedSkill ?? ""}>
                <option value="">Verified in: any skill</option>
                {skillOptions.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    ✓ {s.title}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="credential" defaultValue={sp.credential ?? ""}>
                <option value="">Holds credential: any</option>
                {credentialOptions.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </form>
        </Card>

        <p className="mt-6 text-sm text-emce-text-sec">{rows.length} candidates</p>

        {rows.length === 0 ? (
          <Card className="mt-3 p-10 text-center">
            <div className="text-4xl">🔎</div>
            <p className="mt-3 text-section text-emce-text">No candidates match your search</p>
          </Card>
        ) : (
          <CandidateSearchList candidates={rows} />
        )}
      </div>
    </EmployerShell>
  );
}
