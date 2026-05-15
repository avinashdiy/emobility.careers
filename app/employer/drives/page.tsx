import Link from "next/link";
import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { EmployerShell } from "@/components/layout/employer-shell";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createDrive } from "@/server/campus/actions";

export const metadata = { title: "Campus drives" };

/**
 * Employer-side campus drive list + create. Each drive auto-generates
 * a public landing page at /campus/{slug} — the URL is shown next to
 * the row so the recruiter can copy it for emails / posters.
 */
export default async function CampusDrivesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!employer) redirect("/employer/onboarding");

  const sp = await searchParams;
  const drives = await db.campusDrive.findMany({
    where: { companyId: employer.companyId },
    orderBy: { driveDate: "desc" },
    include: { _count: { select: { jobs: true, candidates: true } } },
  });

  return (
    <EmployerShell>
      <div className="container max-w-5xl py-10 space-y-6">
        <PageHeader
          eyebrow="Hiring"
          title="Campus drives"
          subtitle={
            <>
              Each drive gets its own public landing page at{" "}
              <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[12px] font-mono">
                /campus/&lt;slug&gt;
              </code>{" "}
              — share the URL with the institution, attach roles, and we'll route candidates from there.
            </>
          }
        />

        {sp.error && (
          <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">{sp.error}</div>
        )}

        <Card>
          <SectionTitle title="Create drive" />
          <form action={createDrive} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="title">Drive title *</Label>
              <Input id="title" name="title" required minLength={3} maxLength={140} placeholder="EV Engineering Hiring Drive 2026" />
            </div>
            <div>
              <Label htmlFor="institution">Institution *</Label>
              <Input id="institution" name="institution" required maxLength={200} placeholder="DIYguru Pune Lab" />
            </div>
            {/* City + State stay grouped as one logical block — they
                share a row on sm+, but stack vertically on phones
                where two `h-10` inputs side-by-side at gap-2 used to
                cramp the labels under 360px viewports. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" maxLength={80} />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" maxLength={80} />
              </div>
            </div>
            <div>
              <Label htmlFor="driveDate">Date *</Label>
              <Input id="driveDate" name="driveDate" type="date" required />
            </div>
            <div>
              <Label htmlFor="driveEndDate">End date (multi-day)</Label>
              <Input id="driveEndDate" name="driveEndDate" type="date" />
            </div>
            <div>
              <Label htmlFor="contactName">Coordinator</Label>
              <Input id="contactName" name="contactName" maxLength={120} />
            </div>
            <div>
              <Label htmlFor="contactEmail">Coordinator email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" />
            </div>
            <div>
              <Label htmlFor="maxCandidates">Capacity (max candidates)</Label>
              <Input id="maxCandidates" name="maxCandidates" type="number" min={0} max={10000} />
            </div>
            <div>
              <Label htmlFor="bannerImageUrl">Banner image URL</Label>
              <Input id="bannerImageUrl" name="bannerImageUrl" type="url" placeholder="https://…" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <RichTextEditor
                id="description"
                name="description"
                placeholder="Schedule, expectations, what to bring, dress code, etc."
                minHeight={180}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create drive</Button>
            </div>
          </form>
        </Card>

        {drives.length === 0 ? (
          <EmptyState
            icon="📅"
            title="No drives yet"
            body="Create your first drive above. Each drive can have multiple roles + a custom landing page."
          />
        ) : (
          <ul className="emce-stagger space-y-3">
            {drives.map((d) => (
              <li key={d.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/employer/drives/${d.id}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        {d.title}
                      </Link>
                      <p className="text-hint text-emce-text-sec">
                        {d.institution}
                        {d.city && <>, {d.city}</>} · {d.driveDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                      {d.slug && (
                        <p className="mt-1 text-hint text-emce-text-muted">
                          Landing:{" "}
                          <Link
                            href={`/campus/${d.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emce-dark hover:underline"
                          >
                            /campus/{d.slug} ↗
                          </Link>
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          d.status === "OPEN" || d.status === "IN_PROGRESS" ? "success"
                          : d.status === "DRAFT" ? "warning"
                          : "outline"
                        }
                      >
                        {d.status.replace("_", " ")}
                      </Badge>
                      <span className="text-hint text-emce-text-sec">
                        {d._count.jobs} role{d._count.jobs === 1 ? "" : "s"} · {d._count.candidates} registered
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EmployerShell>
  );
}
