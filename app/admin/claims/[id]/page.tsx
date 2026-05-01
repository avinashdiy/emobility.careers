import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Alert } from "@/components/ui/alert";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  adminApproveCompanyClaim as _approve,
  adminRejectCompanyClaim as _reject,
} from "@/server/companies/claim-actions";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Review claim" };
export const dynamic = "force-dynamic";

// Page-level form-action shims (same pattern as the team module —
// underlying actions return FormState for client useActionState
// callers, page forms need void).
async function approveAction(formData: FormData): Promise<void> {
  "use server";
  await _approve(formData);
}
async function rejectAction(formData: FormData): Promise<void> {
  "use server";
  await _reject(formData);
}

/**
 * Admin detail page for a single company claim. The reviewer reads
 * the proof signals, then decides:
 *   • Approve as RECRUITER / VIEWER / ADMIN (defaults to claimant's
 *     desiredRole). Optional company verification flip.
 *   • Reject with a note (claimant gets emailed; can re-submit).
 *
 * The page surfaces every signal admin needs in one screen — no
 * tabs, no expansion: domain match indicator, claimant account age,
 * email verification status, candidate profile preview, full proof
 * text, prior claim history, and the company's verification state.
 */
export default async function AdminClaimDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const claim = await db.companyClaim.findUnique({
    where: { id },
    include: {
      company: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          hqLocation: true,
          website: true,
          verificationStatus: true,
          ownerUserId: true,
          emailDomains: true,
          createdAt: true,
          owner: { select: { name: true, email: true } },
        },
      },
      claimant: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
          candidateProfile: {
            select: {
              slug: true,
              profilePhotoUrl: true,
              headline: true,
              location: true,
              isDIYguruVerified: true,
            },
          },
        },
      },
      reviewedBy: { select: { name: true, email: true } },
    },
  });
  if (!claim) notFound();

  // Domain-match heuristic — same logic the index page uses but
  // expanded so the admin can see WHICH domains we matched against.
  const claimantDomain = claim.claimant.email.split("@")[1]?.toLowerCase() ?? "";
  const claimedDomain = (claim.workEmail ?? "").split("@")[1]?.toLowerCase() ?? "";
  const accountDomainMatches = claimantDomain
    ? claim.company.emailDomains.includes(claimantDomain)
    : false;
  const workDomainMatches = claimedDomain
    ? claim.company.emailDomains.includes(claimedDomain)
    : false;
  const anyDomainMatch = accountDomainMatches || workDomainMatches;

  // Prior claims by the same user — useful to spot a serial claimer
  // bouncing across companies. Excludes this claim.
  const otherClaims = await db.companyClaim.findMany({
    where: {
      claimantUserId: claim.claimantUserId,
      id: { not: claim.id },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      company: { select: { name: true, slug: true } },
    },
  });

  const accountAgeDays = Math.floor(
    (Date.now() - claim.claimant.createdAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-5 py-8">
        <div>
          <Link href="/admin/claims" className="text-hint text-emce-dark hover:underline">
            ← Back to queue
          </Link>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text">
              Claim review · {claim.company.name}
            </h1>
            <StatusBadge status={claim.status} />
          </div>
          <p className="text-hint text-emce-text-sec">
            Filed {relativeTime(claim.createdAt)}
            {claim.reviewedAt && (
              <> · Reviewed {relativeTime(claim.reviewedAt)} by {claim.reviewedBy?.name ?? claim.reviewedBy?.email ?? "—"}</>
            )}
          </p>
        </div>

        {/* Signal strip — what the admin glances at first */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Signals
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {anyDomainMatch ? (
              <Badge variant="success">
                ✓ Email-domain match
                {workDomainMatches && claimedDomain && <> ({claimedDomain})</>}
                {!workDomainMatches && accountDomainMatches && <> ({claimantDomain})</>}
              </Badge>
            ) : (
              <Badge variant="warning">No domain match</Badge>
            )}
            {claim.claimant.emailVerifiedAt ? (
              <Badge variant="success">✓ Email verified</Badge>
            ) : (
              <Badge variant="danger">Email NOT verified</Badge>
            )}
            {claim.claimant.candidateProfile?.isDIYguruVerified && (
              <Badge variant="success">✓ DIYguru</Badge>
            )}
            <Badge variant={accountAgeDays >= 7 ? "default" : "warning"}>
              Account {accountAgeDays}d old
            </Badge>
            <Badge variant="default">Wants {claim.desiredRole.toLowerCase()}</Badge>
          </div>
          {claim.company.emailDomains.length === 0 && (
            <p className="mt-2 text-hint text-emce-text-muted">
              The company has no `emailDomains` registered. Domain-match
              signal is not available — rely on proof-text + LinkedIn.
            </p>
          )}
        </Card>

        {/* Claimant card */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Claimant
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar
              src={claim.claimant.candidateProfile?.profilePhotoUrl ?? null}
              name={claim.claimant.name ?? claim.claimant.email}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-emce-text">
                {claim.claimant.candidateProfile?.slug ? (
                  <Link
                    href={`/${claim.claimant.candidateProfile.slug}`}
                    className="hover:underline"
                  >
                    {claim.claimant.name ?? claim.claimant.email}
                  </Link>
                ) : (
                  claim.claimant.name ?? claim.claimant.email
                )}
              </p>
              <p className="text-hint text-emce-text-sec">{claim.claimant.email}</p>
              {claim.claimant.candidateProfile?.headline && (
                <p className="text-hint text-emce-text-sec">
                  {claim.claimant.candidateProfile.headline}
                </p>
              )}
              <p className="mt-1 text-hint text-emce-text-muted">
                Current role: {claim.claimant.role.toLowerCase()}
                {claim.designation && <> · self-described: {claim.designation}</>}
              </p>
            </div>
          </div>
        </Card>

        {/* Proof */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Proof
          </p>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-hint text-emce-text-muted">Work email</dt>
              <dd className="font-mono text-sm text-emce-text">
                {claim.workEmail ?? <span className="italic text-emce-text-muted">— not provided</span>}
              </dd>
            </div>
            <div>
              <dt className="text-hint text-emce-text-muted">LinkedIn</dt>
              <dd className="text-sm text-emce-text">
                {claim.linkedinUrl ? (
                  <a
                    href={claim.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="font-bold text-emce-dark hover:underline"
                  >
                    Open profile ↗
                  </a>
                ) : (
                  <span className="italic text-emce-text-muted">— not provided</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <p className="text-hint text-emce-text-muted">Free-text proof</p>
            <p className="mt-1 whitespace-pre-line rounded-md bg-emce-light-soft p-3 text-sm text-emce-text">
              {claim.proofText}
            </p>
          </div>
        </Card>

        {/* Company state */}
        <Card className="p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Target company
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar src={claim.company.logoUrl} name={claim.company.name} size="md" />
            <div className="min-w-0 flex-1">
              <Link
                href={`/company/${claim.company.slug}`}
                className="font-bold text-emce-text hover:underline"
              >
                {claim.company.name}
              </Link>
              <p className="text-hint text-emce-text-sec">
                {claim.company.hqLocation ?? "—"}
                {claim.company.website && (
                  <>
                    {" · "}
                    <a
                      href={claim.company.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-emce-dark hover:underline"
                    >
                      {claim.company.website.replace(/^https?:\/\//, "")} ↗
                    </a>
                  </>
                )}
              </p>
              <p className="text-hint text-emce-text-muted">
                Verification: <Badge variant={claim.company.verificationStatus === "VERIFIED" ? "success" : "outline"} size="sm">{claim.company.verificationStatus.toLowerCase()}</Badge>
                {" · "}Created by {claim.company.owner.name ?? claim.company.owner.email}
                {" · "}{relativeTime(claim.company.createdAt)}
              </p>
              {claim.company.emailDomains.length > 0 && (
                <p className="mt-1 text-hint text-emce-text-muted">
                  Registered domains: <code className="text-emce-text-sec">{claim.company.emailDomains.join(", ")}</code>
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Prior claims by this user */}
        {otherClaims.length > 0 && (
          <Card className="p-4">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
              Other claims by this user
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {otherClaims.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/admin/claims/${o.id}`}
                    className="text-emce-dark hover:underline"
                  >
                    {o.company.name}
                  </Link>
                  <span className="text-hint text-emce-text-muted">
                    {o.status.toLowerCase()} · {relativeTime(o.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Decide — only render the form when status is PENDING */}
        {claim.status === "PENDING" ? (
          <div className="grid gap-3 md:grid-cols-2">
            {/* Approve */}
            <Card className="border-emce-mid/30 bg-emce-light-soft/40 p-4">
              <h2 className="text-section text-emce-text">Approve</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Grants the user {claim.desiredRole.toLowerCase()} access on the company team.
                Optional: flip the company to VERIFIED.
              </p>
              <form action={approveAction} className="mt-3 space-y-3">
                <input type="hidden" name="claimId" value={claim.id} />
                <div>
                  <Label htmlFor="approvedRole">Final role</Label>
                  <NativeSelect
                    id="approvedRole"
                    name="approvedRole"
                    defaultValue={claim.desiredRole}
                  >
                    <option value="VIEWER">Viewer (read-only)</option>
                    <option value="RECRUITER">Recruiter (post jobs)</option>
                    <option value="ADMIN">Admin (full company control)</option>
                  </NativeSelect>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="verifyCompany"
                    value="true"
                    defaultChecked={anyDomainMatch && claim.company.verificationStatus !== "VERIFIED"}
                    className="mt-0.5 h-4 w-4 rounded border-emce-border"
                  />
                  <span>
                    <span className="block font-bold text-emce-text">
                      Mark company as VERIFIED
                    </span>
                    <span className="block text-hint text-emce-text-muted">
                      Recommended when the email-domain matches and this is the first
                      approved claim. Adds the green check on /company/{claim.company.slug}.
                    </span>
                  </span>
                </label>
                <div>
                  <Label htmlFor="reviewerNote" optional>
                    Internal note
                  </Label>
                  <Textarea
                    id="reviewerNote"
                    name="reviewerNote"
                    rows={2}
                    maxLength={2000}
                    placeholder="Optional context — visible in audit log only."
                  />
                </div>
                <ConfirmSubmit
                  variant="default"
                  size="sm"
                  confirm={`Approve this claim? The user gets ${claim.desiredRole.toLowerCase()} access immediately.`}
                >
                  ✓ Approve
                </ConfirmSubmit>
              </form>
            </Card>

            {/* Reject */}
            <Card className="border-emce-orange/30 bg-emce-orange-light/30 p-4">
              <h2 className="text-section text-emce-text">Reject</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Sends the claimant an email with your note. They can fix
                the issue + re-submit.
              </p>
              <form action={rejectAction} className="mt-3 space-y-3">
                <input type="hidden" name="claimId" value={claim.id} />
                <div>
                  <Label htmlFor="rejectNote" required>
                    Why are you rejecting?
                  </Label>
                  <Textarea
                    id="rejectNote"
                    name="reviewerNote"
                    rows={3}
                    minLength={5}
                    maxLength={2000}
                    required
                    placeholder="e.g. Work email isn't on the company domain. Try resubmitting with a verifiable email."
                  />
                </div>
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm="Reject this claim? Claimant will be emailed your note."
                >
                  ✗ Reject
                </ConfirmSubmit>
              </form>
            </Card>
          </div>
        ) : (
          <Alert variant={claim.status === "APPROVED" ? "success" : "info"} title={`Already ${claim.status.toLowerCase()}`}>
            {claim.reviewerNote ?? "No reviewer note recorded."}
          </Alert>
        )}
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (status === "REJECTED") return <Badge variant="danger">Rejected</Badge>;
  if (status === "WITHDRAWN") return <Badge variant="outline">Withdrawn</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}
