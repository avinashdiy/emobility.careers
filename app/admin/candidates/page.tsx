import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/ui/page-header";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Candidates · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

/**
 * Candidate-as-individual list. Complements `/admin/users` (which is
 * across all roles) with a candidate-specific surface — verified
 * badge flips, profile completeness flags, application history at a
 * glance.
 *
 * Filters: name/email search, cohort, DIYguru verified, openToWork,
 * country, profile mode (FRESHER / EXPERIENCED).
 *
 * Clicking a row goes to `/admin/candidates/[slug]` for the editable
 * detail view.
 */
export default async function AdminCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cohort?: string;
    verified?: string;
    openToWork?: string;
    country?: string;
    mode?: string;
    page?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const q = sp.q?.trim() ?? "";
  const cohortId = sp.cohort?.trim() || "";
  const verified = sp.verified === "true" ? true : sp.verified === "false" ? false : null;
  const openToWork = sp.openToWork === "true" ? true : sp.openToWork === "false" ? false : null;
  const country = sp.country?.trim().toUpperCase() || "";
  const mode = sp.mode === "FRESHER" || sp.mode === "EXPERIENCED" ? sp.mode : null;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const where: import("@prisma/client").Prisma.CandidateProfileWhereInput = {
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
            { headline: { contains: q, mode: "insensitive" as const } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
    ...(cohortId ? { cohortId } : {}),
    ...(verified !== null ? { isDIYguruVerified: verified } : {}),
    ...(openToWork !== null ? { openToWork } : {}),
    ...(country ? { country } : {}),
    ...(mode ? { profileMode: mode } : {}),
  };

  const [
    total,
    candidates,
    cohorts,
    verifiedCount,
    openToWorkCount,
    freshersCount,
    experiencedCount,
  ] = await Promise.all([
    db.candidateProfile.count({ where }),
    db.candidateProfile.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        user: { select: { email: true, status: true } },
        cohort: { select: { name: true, slug: true } },
        _count: { select: { applications: true } },
      },
    }),
    db.cohort.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      take: 200,
      select: { id: true, name: true },
    }),
    db.candidateProfile.count({ where: { isDIYguruVerified: true } }),
    db.candidateProfile.count({ where: { openToWork: true } }),
    db.candidateProfile.count({ where: { profileMode: "FRESHER" } }),
    db.candidateProfile.count({ where: { profileMode: "EXPERIENCED" } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminShell>
      <div className="container max-w-7xl space-y-6 py-6 md:py-8">
        <PageHeader
          eyebrow="People"
          title="Candidates"
          subtitle={
            <>
              <strong>{total.toLocaleString("en-IN")}</strong> matching ·{" "}
              {verifiedCount.toLocaleString("en-IN")} verified ·{" "}
              {openToWorkCount.toLocaleString("en-IN")} open-to-work · {freshersCount.toLocaleString("en-IN")} freshers ·{" "}
              {experiencedCount.toLocaleString("en-IN")} experienced
            </>
          }
        />

        {/* Filters */}
        <Card className="p-4">
          <form
            action="/admin/candidates"
            method="get"
            className="grid gap-3 sm:grid-cols-4"
          >
            <div className="sm:col-span-2">
              <Label htmlFor="q">Search</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name, email, headline"
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="cohort">Cohort</Label>
              <NativeSelect id="cohort" name="cohort" defaultValue={cohortId}>
                <option value="">Any</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="country">Country (ISO-2)</Label>
              <Input
                id="country"
                name="country"
                defaultValue={country}
                placeholder="IN"
                maxLength={2}
              />
            </div>
            <div>
              <Label htmlFor="verified">DIYguru verified</Label>
              <NativeSelect id="verified" name="verified" defaultValue={
                verified === true ? "true" : verified === false ? "false" : ""
              }>
                <option value="">Any</option>
                <option value="true">Verified</option>
                <option value="false">Not verified</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="openToWork">Open-to-work</Label>
              <NativeSelect id="openToWork" name="openToWork" defaultValue={
                openToWork === true ? "true" : openToWork === false ? "false" : ""
              }>
                <option value="">Any</option>
                <option value="true">Open</option>
                <option value="false">Not open</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="mode">Mode</Label>
              <NativeSelect id="mode" name="mode" defaultValue={mode ?? ""}>
                <option value="">Any</option>
                <option value="FRESHER">Fresher</option>
                <option value="EXPERIENCED">Experienced</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-4 flex justify-end gap-3">
              {(q || cohortId || verified !== null || openToWork !== null || country || mode) && (
                <Link
                  href="/admin/candidates"
                  className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
                >
                  Clear
                </Link>
              )}
              <SubmitButton size="sm" variant="outline">Apply</SubmitButton>
            </div>
          </form>
        </Card>

        {/* List */}
        {candidates.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              No candidates match this filter.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-emce-border">
              {candidates.map((c) => {
                const years = Math.floor(c.totalExperienceMonths / 12);
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-emce-light-soft">
                    <Avatar
                      src={c.profilePhotoUrl}
                      name={`${c.firstName} ${c.lastName ?? ""}`}
                      size="sm"
                      className="h-10 w-10 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link
                          href={`/admin/candidates/${c.slug}`}
                          className="truncate text-sm font-bold text-emce-text hover:underline"
                        >
                          {c.firstName} {c.lastName ?? ""}
                        </Link>
                        {c.isDIYguruVerified && (
                          <Badge variant="success" size="sm">✓ Verified</Badge>
                        )}
                        {c.openToWork && (
                          <Badge variant="default" size="sm">Open</Badge>
                        )}
                        {c.hiringNow && (
                          <Badge variant="warning" size="sm">Hiring</Badge>
                        )}
                        {c.user.status !== "ACTIVE" && (
                          <Badge variant="danger" size="sm">{c.user.status.toLowerCase()}</Badge>
                        )}
                        {c.cohort && (
                          <Badge variant="outline" size="sm">
                            🎓 {c.cohort.name}
                          </Badge>
                        )}
                      </div>
                      <p className="line-clamp-1 text-hint text-emce-text-sec">
                        {c.headline ?? <em>no headline</em>}
                      </p>
                      <p className="text-[10px] text-emce-text-muted">
                        {c.user.email}
                        {c.city ? ` · 📍 ${c.city}${c.country ? `, ${c.country}` : ""}` : ""}
                        {" · "}
                        {c.profileMode === "FRESHER" ? "Fresher" : `${years}y exp`}
                        {" · "}
                        {c._count.applications} applications
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-[10px] text-emce-text-muted">
                        Updated {relativeTime(c.updatedAt)}
                      </p>
                      <Link
                        href={`/admin/candidates/${c.slug}`}
                        className="text-hint font-bold text-emce-dark hover:underline"
                      >
                        Open →
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-hint text-emce-text-sec">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={
                    `/admin/candidates?page=${page - 1}` +
                    (q ? `&q=${encodeURIComponent(q)}` : "") +
                    (cohortId ? `&cohort=${cohortId}` : "") +
                    (verified !== null ? `&verified=${verified}` : "") +
                    (openToWork !== null ? `&openToWork=${openToWork}` : "") +
                    (country ? `&country=${country}` : "") +
                    (mode ? `&mode=${mode}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={
                    `/admin/candidates?page=${page + 1}` +
                    (q ? `&q=${encodeURIComponent(q)}` : "") +
                    (cohortId ? `&cohort=${cohortId}` : "") +
                    (verified !== null ? `&verified=${verified}` : "") +
                    (openToWork !== null ? `&openToWork=${openToWork}` : "") +
                    (country ? `&country=${country}` : "") +
                    (mode ? `&mode=${mode}` : "")
                  }
                  className="inline-flex h-9 items-center justify-center rounded-md border border-emce-border bg-white px-4 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
