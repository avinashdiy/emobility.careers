import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import {
  updateDrive,
  setDriveStatus,
  attachJobToDrive,
  detachJobFromDrive,
} from "@/server/campus/actions";
import { CampusDriveStatus } from "@prisma/client";

export const metadata = { title: "Edit drive" };

export default async function EditDrivePage({
  params,
  searchParams,
}: {
  params: Promise<{ driveId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { driveId } = await params;
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const drive = await db.campusDrive.findUnique({
    where: { id: driveId },
    include: {
      jobs: { include: { job: { select: { id: true, title: true, status: true } } } },
    },
  });
  if (!drive) notFound();
  if (session.user.role !== "ADMIN" && drive.companyId !== employer.companyId) redirect("/403");

  // Unattached open jobs the recruiter can pull onto this drive's
  // landing page. Capped at 30 — past that we'd want a search input.
  const attachedIds = new Set(drive.jobs.map((j) => j.jobId));
  const availableJobs = await db.jobPosting.findMany({
    where: {
      companyId: drive.companyId,
      status: { in: ["OPEN", "DRAFT"] },
      id: { notIn: [...attachedIds] },
    },
    take: 30,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true },
  });

  return (
    <EmployerShell>
      <div className="container max-w-4xl py-10 space-y-6">
        <div>
          <Link href="/employer/drives" className="text-hint font-bold text-emce-dark hover:underline">
            ← All drives
          </Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-dashboard text-emce-text">{drive.title}</h1>
            <Badge
              variant={
                drive.status === "OPEN" || drive.status === "IN_PROGRESS" ? "success"
                : drive.status === "DRAFT" ? "warning"
                : "outline"
              }
            >
              {drive.status.replace("_", " ")}
            </Badge>
          </div>
          {drive.slug && (
            <p className="mt-1 text-sm text-emce-text-sec">
              Public landing page:{" "}
              <Link
                href={`/campus/${drive.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emce-dark hover:underline"
              >
                /campus/{drive.slug} ↗
              </Link>
            </p>
          )}
        </div>

        {sp.error && (
          <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">{sp.error}</div>
        )}

        {/* Status workflow */}
        <Card>
          <h2 className="text-section text-emce-text">Status</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            DRAFT hides the landing page from the public. Move to OPEN once you're ready to share the URL.
          </p>
          <form action={setDriveStatus} className="mt-3 flex items-center gap-2">
            <input type="hidden" name="driveId" value={drive.id} />
            <NativeSelect name="status" defaultValue={drive.status}>
              {Object.values(CampusDriveStatus).map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm">Save status</Button>
          </form>
        </Card>

        {/* Linked roles */}
        <Card>
          <h2 className="text-section text-emce-text">Roles on this drive</h2>
          {drive.jobs.length === 0 ? (
            <p className="mt-2 text-sm text-emce-text-sec">No roles attached yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border">
              {drive.jobs.map(({ job }) => (
                <li key={job.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link href={`/employer/jobs/${job.id}`} className="font-bold text-emce-text hover:underline">
                      {job.title}
                    </Link>
                    <p className="text-hint text-emce-text-sec">{job.status}</p>
                  </div>
                  <form action={detachJobFromDrive}>
                    <input type="hidden" name="driveId" value={drive.id} />
                    <input type="hidden" name="jobId" value={job.id} />
                    <Button type="submit" variant="ghost" size="sm">Remove</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {availableJobs.length > 0 && (
            <form action={attachJobToDrive} className="mt-4 flex items-center gap-2">
              <input type="hidden" name="driveId" value={drive.id} />
              <NativeSelect name="jobId" required>
                <option value="">Pick a role to attach…</option>
                {availableJobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title} ({j.status})</option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm">Attach</Button>
            </form>
          )}
        </Card>

        {/* Edit details */}
        <Card>
          <h2 className="text-section text-emce-text">Drive details</h2>
          <form action={updateDrive} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="driveId" value={drive.id} />
            <div className="sm:col-span-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" name="title" defaultValue={drive.title} required maxLength={140} />
            </div>
            <div>
              <Label htmlFor="institution">Institution *</Label>
              <Input id="institution" name="institution" defaultValue={drive.institution} required maxLength={200} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" defaultValue={drive.city ?? ""} maxLength={80} />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" defaultValue={drive.state ?? ""} maxLength={80} />
              </div>
            </div>
            <div>
              <Label htmlFor="driveDate">Date *</Label>
              <Input
                id="driveDate"
                name="driveDate"
                type="date"
                defaultValue={drive.driveDate.toISOString().slice(0, 10)}
                required
              />
            </div>
            <div>
              <Label htmlFor="driveEndDate">End date (multi-day)</Label>
              <Input
                id="driveEndDate"
                name="driveEndDate"
                type="date"
                defaultValue={drive.driveEndDate ? drive.driveEndDate.toISOString().slice(0, 10) : ""}
              />
            </div>
            <div>
              <Label htmlFor="contactName">Coordinator</Label>
              <Input id="contactName" name="contactName" defaultValue={drive.contactName ?? ""} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="contactEmail">Coordinator email</Label>
              <Input id="contactEmail" name="contactEmail" type="email" defaultValue={drive.contactEmail ?? ""} />
            </div>
            <div>
              <Label htmlFor="contactPhone">Coordinator phone</Label>
              <Input id="contactPhone" name="contactPhone" defaultValue={drive.contactPhone ?? ""} maxLength={40} />
            </div>
            <div>
              <Label htmlFor="maxCandidates">Capacity</Label>
              <Input
                id="maxCandidates"
                name="maxCandidates"
                type="number"
                min={0}
                max={10000}
                defaultValue={drive.maxCandidates ?? ""}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="bannerImageUrl">Banner image URL</Label>
              <Input
                id="bannerImageUrl"
                name="bannerImageUrl"
                type="url"
                defaultValue={drive.bannerImageUrl ?? ""}
                placeholder="https://…"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                rows={6}
                maxLength={8000}
                defaultValue={drive.description ?? ""}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="landingPageOverride">External landing override (advanced)</Label>
              <Input
                id="landingPageOverride"
                name="landingPageOverride"
                type="url"
                defaultValue={
                  drive.landingPageUrl &&
                  !drive.landingPageUrl.endsWith(`/campus/${drive.slug}`)
                    ? drive.landingPageUrl
                    : ""
                }
                placeholder="https://… (leave blank to use the auto-generated /campus page)"
              />
              <p className="mt-1 text-hint text-emce-text-muted">
                Leave blank to use the auto-generated{" "}
                <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[11px] font-mono">
                  /campus/{drive.slug}
                </code>{" "}
                page. Only use an override if you're routing to an external system (Calendly, Unstop, etc.).
              </p>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
      </div>
    </EmployerShell>
  );
}
