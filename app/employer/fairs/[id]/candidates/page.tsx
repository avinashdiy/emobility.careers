import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Registered candidates · pre-screen" };
export const dynamic = "force-dynamic";

/**
 * Employer pre-screen view of every candidate registered for a fair
 * their company has a confirmed booth at. Helps the recruiter prepare
 * before fair day:
 *   • See who's coming
 *   • Filter by fair mode (offline / online / hybrid availability)
 *   • Filter by experience level (fresher / experienced)
 *   • Filter by DIYguru-verified
 *   • Filter by EV-experience flag
 *   • Open any candidate's full profile in a new tab
 *
 * Read-only — no shortlist / message actions here (those live on
 * the candidate's public profile, which already has the
 * Connect / Save / Message buttons gated correctly).
 */
export default async function FairCandidatesPrescreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fairMode?: string; level?: string; diyguru?: string; ev?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const { id } = await params;
  const sp = await searchParams;

  const drive = await db.recruitmentDrive.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, city: true, state: true, status: true },
  });
  if (!drive) notFound();

  // Gate on confirmed booth (same as scanner page).
  if (session.user.role !== "ADMIN") {
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
      select: { companyId: true },
    });
    if (!employer) redirect("/employer/onboarding");
    const participation = await db.recruitmentDriveCompany.findUnique({
      where: { driveId_companyId: { driveId: id, companyId: employer.companyId } },
      select: { status: true },
    });
    if (!participation) {
      redirect(`/employer/fairs?error=${encodeURIComponent("Not registered for this fair.")}`);
    }
    if (participation.status !== "CONFIRMED") {
      redirect(`/employer/fairs/${id}?error=${encodeURIComponent("Confirm your booth to see candidates.")}`);
    }
  }

  // Build where based on filter chips.
  const where: Parameters<typeof db.recruitmentDriveRegistration.findMany>[0] = {
    where: {
      driveId: drive.id,
      cancelledAt: null,
      ...(sp.fairMode && ["OFFLINE", "ONLINE", "HYBRID"].includes(sp.fairMode)
        ? { fairMode: sp.fairMode as "OFFLINE" | "ONLINE" | "HYBRID" }
        : {}),
      ...(sp.diyguru === "1"
        ? { candidate: { isDIYguruVerified: true } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  };
  const candidates = await db.recruitmentDriveRegistration.findMany({
    ...where,
    select: {
      id: true, createdAt: true, fairMode: true, intendedRoles: true, willingLocations: true,
      formAnswers: true,
      candidate: {
        select: {
          slug: true, firstName: true, lastName: true, profilePhotoUrl: true,
          headline: true, isDIYguruVerified: true, profileCompleteness: true,
          phone: true, email: true,
          education: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { institution: true, degree: true },
          },
          skills: {
            take: 5,
            select: { skill: { select: { name: true } } },
          },
        },
      },
    },
  });

  // Apply post-fetch filters that aren't easily expressed in
  // Prisma where (formAnswers is JSON).
  const filtered = candidates.filter((c) => {
    const fa = (c.formAnswers ?? {}) as Record<string, unknown>;
    if (sp.level === "fresher" && fa.experienceLevel !== "FRESHER") return false;
    if (sp.level === "experienced" && fa.experienceLevel !== "EXPERIENCED") return false;
    if (sp.ev === "1" && fa.hasEvExperience !== true) return false;
    return true;
  });

  return (
    <EmployerShell>
      <div className="container max-w-5xl py-8">
        <Link href={`/employer/fairs/${drive.id}`} className="text-xs font-bold text-emce-dark hover:underline">
          ← Booth overview
        </Link>
        <h1 className="mt-1 text-dashboard text-emce-text">Registered candidates — pre-screen</h1>
        <p className="mt-1 text-hint text-emce-text-sec">
          {drive.title} · {[drive.city, drive.state].filter(Boolean).join(", ")} ·{" "}
          <strong className="text-emce-text">{filtered.length}</strong> match
          {filtered.length === 1 ? "" : "es"} (of {candidates.length} registered)
        </p>

        {/* Filter chips — Link-based so the URL is the source of
            truth + filters can be shared with teammates. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <FilterChip href={buildHref(drive.id, sp, { fairMode: undefined })} active={!sp.fairMode}>All modes</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { fairMode: "OFFLINE" })} active={sp.fairMode === "OFFLINE"}>📍 Offline only</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { fairMode: "ONLINE" })} active={sp.fairMode === "ONLINE"}>💻 Online only</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { fairMode: "HYBRID" })} active={sp.fairMode === "HYBRID"}>🔀 Hybrid</FilterChip>
          <span className="w-px bg-emce-border" />
          <FilterChip href={buildHref(drive.id, sp, { level: undefined })} active={!sp.level}>All levels</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { level: "fresher" })} active={sp.level === "fresher"}>Freshers</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { level: "experienced" })} active={sp.level === "experienced"}>Experienced</FilterChip>
          <span className="w-px bg-emce-border" />
          <FilterChip href={buildHref(drive.id, sp, { diyguru: sp.diyguru === "1" ? undefined : "1" })} active={sp.diyguru === "1"}>⭐ DIYguru</FilterChip>
          <FilterChip href={buildHref(drive.id, sp, { ev: sp.ev === "1" ? undefined : "1" })} active={sp.ev === "1"}>EV experience</FilterChip>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon="🎓"
              title="No candidates match these filters"
              body="Loosen a filter, or wait — more candidates register every day before the fair."
            />
          </div>
        ) : (
          <ul className="mt-5 space-y-2">
            {filtered.map((r) => {
              const c = r.candidate;
              const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
              const fa = (r.formAnswers ?? {}) as Record<string, unknown>;
              const year = String(fa.yearOfStudy ?? "");
              return (
                <li key={r.id}>
                  <Card className="p-3">
                    <div className="flex items-start gap-3">
                      <Avatar src={c.profilePhotoUrl} name={name} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/${c.slug}?fairCtx=${drive.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emce-text hover:underline"
                          >
                            {name}
                          </Link>
                          {c.isDIYguruVerified && (
                            <Badge variant="verified" size="sm">⭐ DIYguru</Badge>
                          )}
                          {r.fairMode && <Badge variant="outline" size="sm">{r.fairMode}</Badge>}
                          {fa.experienceLevel === "FRESHER" && <Badge variant="default" size="sm">Fresher</Badge>}
                          {fa.experienceLevel === "EXPERIENCED" && <Badge variant="default" size="sm">Experienced</Badge>}
                          {fa.hasEvExperience === true && <Badge variant="default" size="sm">⚡ EV exp</Badge>}
                        </div>
                        {c.headline && (
                          <p className="mt-0.5 line-clamp-1 text-hint text-emce-text">{c.headline}</p>
                        )}
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          {c.education[0]?.institution ?? "—"} · {c.education[0]?.degree ?? ""}
                          {year && ` · Year ${year}`}
                        </p>
                        {r.intendedRoles && (
                          <p className="mt-0.5 text-hint text-emce-text-sec">
                            <strong>Wants:</strong> {r.intendedRoles}
                          </p>
                        )}
                        {c.skills.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.skills.map((s) => (
                              <Badge key={s.skill.name} variant="outline" size="sm" className="text-[10px]">
                                {s.skill.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-hint text-emce-text-muted">
                        <p>{c.profileCompleteness}% complete</p>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </EmployerShell>
  );
}

function buildHref(
  id: string,
  current: { fairMode?: string; level?: string; diyguru?: string; ev?: string },
  patch: Partial<{ fairMode?: string; level?: string; diyguru?: string; ev?: string }>,
): string {
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return `/employer/fairs/${id}/candidates${qs ? `?${qs}` : ""}`;
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-xs font-bold ${
        active
          ? "bg-emce-dark text-emce-light"
          : "border border-emce-border bg-white text-emce-text-sec hover:bg-emce-light-soft"
      }`}
    >
      {children}
    </Link>
  );
}
