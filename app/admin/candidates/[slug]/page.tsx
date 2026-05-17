import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  adminUpdateCandidateProfile,
  adminToggleDIYguruVerified,
} from "@/server/admin/candidate-actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Edit candidate · Admin" };
export const dynamic = "force-dynamic";

export default async function AdminCandidateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { slug } = await params;

  const candidate = await db.candidateProfile.findUnique({
    where: { slug },
    include: {
      user: { select: { id: true, email: true, status: true, role: true, createdAt: true } },
      cohort: { select: { id: true, name: true, slug: true } },
      _count: {
        select: {
          applications: true,
          experiences: true,
          education: true,
          certifications: true,
          skills: true,
        },
      },
    },
  });
  if (!candidate) notFound();

  // Application history (last 20) — admin needs to see what the
  // candidate has been doing on the platform.
  const recentApplications = await db.application.findMany({
    where: { candidateId: candidate.id },
    orderBy: { appliedAt: "desc" },
    take: 20,
    include: {
      job: {
        select: {
          id: true,
          title: true,
          company: { select: { name: true, slug: true } },
        },
      },
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />

        <Link
          href="/admin/candidates"
          className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
        >
          ← All candidates
        </Link>

        <PageHeader
          eyebrow="Candidate · admin edit"
          title={`${candidate.firstName} ${candidate.lastName ?? ""}`}
          subtitle={
            <>
              <Link
                href={`/${candidate.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emce-dark hover:underline"
              >
                View public profile ↗
              </Link>
              {" · "}
              <Link
                href={`/admin/users?q=${encodeURIComponent(candidate.user.email ?? "")}`}
                className="font-bold text-emce-dark hover:underline"
              >
                User account
              </Link>
            </>
          }
        />

        {/* Identity summary */}
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar
              src={candidate.profilePhotoUrl}
              name={`${candidate.firstName} ${candidate.lastName ?? ""}`}
              size="lg"
              className="h-16 w-16 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-section text-emce-text">
                  {candidate.firstName} {candidate.lastName ?? ""}
                </h2>
                {candidate.isDIYguruVerified && (
                  <Badge variant="success" size="sm">✓ DIYguru verified</Badge>
                )}
                {candidate.openToWork && <Badge variant="default" size="sm">Open to work</Badge>}
                {candidate.user.status !== "ACTIVE" && (
                  <Badge variant="danger" size="sm">{candidate.user.status.toLowerCase()}</Badge>
                )}
                {candidate.cohort && (
                  <Badge variant="outline" size="sm">🎓 {candidate.cohort.name}</Badge>
                )}
              </div>
              <p className="mt-1 text-hint text-emce-text-sec">
                {candidate.headline ?? <em>No headline</em>}
              </p>
              <p className="mt-1 text-[11px] text-emce-text-muted">
                {candidate.user.email} · Joined {relativeTime(candidate.user.createdAt)} ·{" "}
                {candidate._count.applications} apps · {candidate._count.experiences} jobs ·{" "}
                {candidate._count.education} edu · {candidate._count.skills} skills
              </p>
            </div>
            <form action={adminToggleDIYguruVerified}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <ConfirmSubmit
                size="sm"
                variant="outline"
                confirm={
                  candidate.isDIYguruVerified
                    ? "Remove DIYguru verified badge from this candidate?"
                    : "Grant DIYguru verified badge to this candidate?"
                }
                pendingLabel="…"
              >
                {candidate.isDIYguruVerified ? "Remove verified" : "Mark verified"}
              </ConfirmSubmit>
            </form>
          </div>
        </Card>

        {/* Edit form */}
        <Card className="p-6">
          <h2 className="text-section text-emce-text">Edit profile</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Use this to fix typos / wrong data. The candidate&apos;s own editor at
            /me/profile owns the full editing surface — only the basics live here.
          </p>
          <form
            action={adminUpdateCandidateProfile}
            className="mt-4 space-y-4"
          >
            <input type="hidden" name="candidateId" value={candidate.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name *</Label>
                <Input
                  id="firstName"
                  name="firstName"
                  defaultValue={candidate.firstName}
                  required
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  name="lastName"
                  defaultValue={candidate.lastName ?? ""}
                  maxLength={80}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="headline">Headline</Label>
              <Input
                id="headline"
                name="headline"
                defaultValue={candidate.headline ?? ""}
                maxLength={160}
                placeholder="Battery cell engineer · 6 yrs"
              />
            </div>

            <div>
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                name="summary"
                defaultValue={candidate.summary ?? ""}
                rows={4}
                maxLength={4000}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="email">Profile email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={candidate.email ?? ""}
                  maxLength={160}
                  placeholder="Same as account email if blank"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={candidate.phone ?? ""}
                  maxLength={40}
                />
              </div>
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  defaultValue={candidate.city ?? ""}
                  maxLength={80}
                />
              </div>
              <div>
                <Label htmlFor="country">Country (ISO-2)</Label>
                <Input
                  id="country"
                  name="country"
                  defaultValue={candidate.country ?? ""}
                  maxLength={2}
                  placeholder="IN"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="location">Display location</Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={candidate.location ?? ""}
                  maxLength={120}
                  placeholder="Pune, MH (free text — shown on profile header)"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="totalExperienceMonths">Experience (months)</Label>
                <Input
                  id="totalExperienceMonths"
                  name="totalExperienceMonths"
                  type="number"
                  min={0}
                  max={720}
                  inputMode="numeric"
                  defaultValue={candidate.totalExperienceMonths}
                />
              </div>
              <div>
                <Label htmlFor="noticePeriodDays">Notice period (days)</Label>
                <Input
                  id="noticePeriodDays"
                  name="noticePeriodDays"
                  type="number"
                  min={0}
                  max={365}
                  inputMode="numeric"
                  defaultValue={candidate.noticePeriodDays ?? ""}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="resumeUrl">Resume URL</Label>
                <Input
                  id="resumeUrl"
                  name="resumeUrl"
                  defaultValue={candidate.resumeUrl ?? ""}
                  maxLength={500}
                  type="url"
                />
              </div>
              <div>
                <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                <Input
                  id="linkedinUrl"
                  name="linkedinUrl"
                  defaultValue={candidate.linkedinUrl ?? ""}
                  maxLength={500}
                  type="url"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 border-t border-emce-border pt-3">
              <label className="inline-flex items-center gap-2 text-sm text-emce-text-sec">
                <input
                  type="checkbox"
                  name="openToWork"
                  value="true"
                  defaultChecked={candidate.openToWork}
                />
                Open to work
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-emce-text-sec">
                <input
                  type="checkbox"
                  name="hiringNow"
                  value="true"
                  defaultChecked={candidate.hiringNow}
                />
                Hiring now (if recruiter)
              </label>
            </div>

            <div className="flex justify-end border-t border-emce-border pt-3">
              <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
            </div>
          </form>
        </Card>

        {/* Recent applications */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-section text-emce-text">
              Recent applications ({candidate._count.applications})
            </h2>
            <Link
              href={`/admin/applications?q=${encodeURIComponent(candidate.user.email ?? "")}`}
              className="text-hint font-bold text-emce-dark hover:underline"
            >
              See all →
            </Link>
          </div>
          {recentApplications.length === 0 ? (
            <p className="mt-2 text-hint text-emce-text-sec">No applications yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border">
              {recentApplications.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-bold text-emce-text">
                      {a.job.title}
                    </p>
                    <p className="text-hint text-emce-text-sec">
                      {a.job.company.name} · {relativeTime(a.appliedAt)}
                    </p>
                  </div>
                  <Badge variant="default" size="sm">
                    {a.stage.toLowerCase()}
                  </Badge>
                  <Link
                    href={`/employer/applications/${a.id}`}
                    className="text-hint font-bold text-emce-dark hover:underline"
                  >
                    Open →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
