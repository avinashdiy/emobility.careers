import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Recruitathon — per-fair admin" };
export const dynamic = "force-dynamic";

/**
 * Per-fair view of inline-signup registrations — candidates first,
 * then employers. Each card shows the placement-team-relevant data
 * at a glance + a "Review" link to the underlying entity page.
 *
 * Two CSV download buttons at the top mirror the index-page
 * shortcuts; they route to the same /candidates.csv + /employers.csv
 * endpoints in this folder.
 */
export default async function AdminRecruitathonFairPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { slug } = await params;
  const sp = await searchParams;
  const tab: "candidates" | "employers" = sp.tab === "employers" ? "employers" : "candidates";

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, city: true, state: true, startsAt: true, status: true },
  });
  if (!drive) notFound();

  const [candidates, companies] = await Promise.all([
    db.recruitmentDriveRegistration.findMany({
      where: { driveId: drive.id },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, checkInCode: true, source: true, createdAt: true,
        fairMode: true, intendedRoles: true, willingLocations: true,
        formAnswers: true,
        candidate: {
          select: {
            id: true, slug: true, firstName: true, lastName: true,
            email: true, phone: true, linkedinUrl: true,
            isDIYguruVerified: true, profileCompleteness: true,
            education: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { institution: true, degree: true, field: true },
            },
            user: { select: { id: true, emailVerifiedAt: true } },
          },
        },
      },
    }),
    db.recruitmentDriveCompany.findMany({
      where: { driveId: drive.id },
      orderBy: { invitedAt: "desc" },
      take: 500,
      select: {
        id: true, status: true, invitedAt: true, confirmedAt: true,
        fairMode: true, hiresFreshers: true, providesTraining: true,
        growthOpportunities: true, pocPhone: true, aboutAtFair: true,
        formAnswers: true,
        company: {
          select: {
            id: true, slug: true, name: true, logoUrl: true, website: true,
            verificationStatus: true,
            team: {
              where: { isCompanyAdmin: true },
              take: 1,
              select: {
                designation: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const place = [drive.city, drive.state].filter(Boolean).join(", ");
  const when = new Date(drive.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <AdminShell>
      <div className="container max-w-6xl py-8">
        <Link href="/admin/recruitathon" className="text-xs font-bold text-emce-dark hover:underline">
          ← All fairs
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">{drive.title}</h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              📅 {when} · 📍 {place} · status: <Badge variant="outline" size="sm">{drive.status}</Badge>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={`/admin/recruitathon/${drive.slug}/live`}>⚡ Live dashboard</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/admin/recruitathon/${drive.slug}/candidates.csv`}>📥 Candidates ({candidates.length})</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/admin/recruitathon/${drive.slug}/employers.csv`}>📥 Employers ({companies.length})</a>
            </Button>
          </div>
        </div>

        <nav aria-label="Switch list" className="mt-6 flex gap-2">
          <Link
            href={`/admin/recruitathon/${drive.slug}?tab=candidates`}
            aria-current={tab === "candidates" ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              tab === "candidates" ? "bg-emce-dark text-emce-light" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
            }`}
          >
            Candidates ({candidates.length})
          </Link>
          <Link
            href={`/admin/recruitathon/${drive.slug}?tab=employers`}
            aria-current={tab === "employers" ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
              tab === "employers" ? "bg-emce-dark text-emce-light" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
            }`}
          >
            Employers ({companies.length})
          </Link>
        </nav>

        {tab === "candidates" ? (
          candidates.length === 0 ? (
            <EmptyState icon="🎓" title="No candidate registrations yet" body="The inline-signup form hasn't received any submissions for this fair." />
          ) : (
            <ul className="mt-5 space-y-2">
              {candidates.map((r) => {
                const c = r.candidate;
                const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
                const formAnswers = (r.formAnswers ?? {}) as Record<string, unknown>;
                const yearOfStudy = String(formAnswers.yearOfStudy ?? "—");
                const experienceLevel = String(formAnswers.experienceLevel ?? "—");
                const hasEv = formAnswers.hasEvExperience ? "Yes" : "No";
                return (
                  <li key={r.id}>
                    <Card className="p-3 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <Link href={`/${c.slug}`} className="font-bold text-emce-text hover:underline">
                              {name}
                            </Link>
                            <span className="font-mono text-xs font-bold tracking-wider text-emce-text-sec">{r.checkInCode}</span>
                            {r.source === "RECRUITATHON_INLINE" && (
                              <Badge variant="success" size="sm">Inline</Badge>
                            )}
                            {c.isDIYguruVerified && <Badge variant="verified" size="sm">DIYguru</Badge>}
                            {!c.user.emailVerifiedAt && <Badge variant="warning" size="sm">Email unverified</Badge>}
                            {r.fairMode && <Badge variant="outline" size="sm">{r.fairMode}</Badge>}
                          </div>
                          <p className="mt-0.5 text-hint text-emce-text-sec">
                            {c.email} · {c.phone ?? "no phone"}
                            {c.linkedinUrl && (
                              <> · <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-emce-dark hover:underline">LinkedIn</a></>
                            )}
                          </p>
                          <p className="mt-0.5 text-hint text-emce-text-sec">
                            {c.education[0]?.institution ?? "—"} · {c.education[0]?.degree ?? "—"} · Year: <strong>{yearOfStudy}</strong> · {experienceLevel} · EV exp: {hasEv}
                          </p>
                          <p className="mt-0.5 text-hint text-emce-text-sec">
                            <strong>Roles:</strong> {r.intendedRoles ?? "—"} · <strong>Locations:</strong> {r.willingLocations ?? "—"}
                          </p>
                          <p className="mt-0.5 text-hint text-emce-text-muted">
                            Profile {c.profileCompleteness}% complete · {relativeTime(r.createdAt)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )
        ) : companies.length === 0 ? (
          <EmptyState icon="🏢" title="No employer registrations yet" body="The inline-signup form hasn't received any employer submissions for this fair." />
        ) : (
          <ul className="mt-5 space-y-2">
            {companies.map((p) => {
              const adminMember = p.company.team[0];
              const formAnswers = (p.formAnswers ?? {}) as Record<string, unknown>;
              return (
                <li key={p.id}>
                  <Card className="p-3 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link href={`/company/${p.company.slug}`} className="font-bold text-emce-text hover:underline">
                            {p.company.name}
                          </Link>
                          <Badge
                            variant={p.status === "CONFIRMED" ? "success" : p.status === "WITHDRAWN" ? "default" : "warning"}
                            size="sm"
                          >
                            {p.status}
                          </Badge>
                          {p.fairMode && <Badge variant="outline" size="sm">{p.fairMode}</Badge>}
                          {p.hiresFreshers && <Badge variant="default" size="sm">Freshers ✓</Badge>}
                          {p.providesTraining && <Badge variant="default" size="sm">Training ✓</Badge>}
                          {p.company.verificationStatus === "VERIFIED" && (
                            <Badge variant="verified" size="sm">Verified</Badge>
                          )}
                        </div>
                        {p.company.website && (
                          <p className="mt-0.5 text-hint text-emce-text-sec">
                            <a href={p.company.website} target="_blank" rel="noopener noreferrer" className="text-emce-dark hover:underline">
                              {p.company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            </a>
                            {" · "}
                            Industry: {String(formAnswers.industry ?? "—")}
                          </p>
                        )}
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          <strong>POC:</strong>{" "}
                          {adminMember
                            ? `${adminMember.user.name ?? adminMember.user.email} · ${adminMember.designation ?? ""}`.trim()
                            : "—"}
                          {p.pocPhone && <> · {p.pocPhone}</>}
                        </p>
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          <strong>Open roles:</strong> {p.aboutAtFair ?? "—"}
                        </p>
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          <strong>Hiring locations:</strong> {String(formAnswers.hiringLocations ?? "—")} · <strong>Skills:</strong> {String(formAnswers.desiredSkills ?? "—")}
                        </p>
                        <p className="mt-0.5 text-hint text-emce-text-muted">
                          Registered {relativeTime(p.invitedAt)}
                          {p.confirmedAt && ` · Confirmed ${relativeTime(p.confirmedAt)}`}
                        </p>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
