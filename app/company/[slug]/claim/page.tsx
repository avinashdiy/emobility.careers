import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { CompanyClaimForm } from "@/components/companies/CompanyClaimForm";

export const metadata: Metadata = { title: "Claim company" };
export const dynamic = "force-dynamic";

/**
 * Public claim entry point at /company/[slug]/claim. Three branches:
 *
 *   1. Anonymous → bounce to /signin with `next` set so they land
 *      back here after auth.
 *   2. User is already on the company's team → friendly redirect to
 *      /employer; no claim needed.
 *   3. Otherwise → render the claim form, pre-filled with any
 *      existing claim's state (lets users iterate on a rejected
 *      claim or check their PENDING status without re-typing).
 */
export default async function CompanyClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const company = await db.company.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      hqLocation: true,
      verificationStatus: true,
      ownerUserId: true,
      emailDomains: true,
    },
  });
  if (!company) notFound();
  if (company.verificationStatus === "REJECTED") notFound();

  if (!session?.user) {
    redirect(`/signin?next=/company/${slug}/claim`);
  }

  // Already on the team — bounce to /employer.
  const onTeam = await db.employerProfile.findFirst({
    where: { userId: session.user.id, companyId: company.id },
    select: { id: true },
  });
  if (onTeam || company.ownerUserId === session.user.id) {
    redirect(`/employer?notice=${encodeURIComponent(`You already represent ${company.name}.`)}`);
  }

  // Pre-fill state from any existing claim.
  const existing = await db.companyClaim.findUnique({
    where: {
      companyId_claimantUserId: {
        companyId: company.id,
        claimantUserId: session.user.id,
      },
    },
    select: {
      status: true,
      proofText: true,
      designation: true,
      desiredRole: true,
      workEmail: true,
      linkedinUrl: true,
      reviewerNote: true,
    },
  });

  // Email-domain match hint — if the user has a verified work email
  // matching one of the company's emailDomains, we surface a
  // green-check pill. Doesn't auto-approve anything; just helps the
  // claimant see we recognise their domain.
  const userRow = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const userDomain = userRow?.email?.split("@")[1]?.toLowerCase() ?? "";
  const domainMatches =
    userDomain.length > 0 && company.emailDomains.some((d) => d.toLowerCase() === userDomain);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-2xl space-y-5 py-8 md:py-10">
        <Link
          href={`/company/${slug}`}
          className="text-hint text-emce-dark hover:underline"
        >
          ← Back to {company.name}
        </Link>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Avatar src={company.logoUrl} name={company.name} size="md" />
            <div className="min-w-0 flex-1">
              <h1 className="text-dashboard text-emce-text md:text-2xl">{company.name}</h1>
              <div className="mt-1 flex flex-wrap items-baseline gap-2 text-hint text-emce-text-sec">
                {company.hqLocation && <span>📍 {company.hqLocation}</span>}
                {company.verificationStatus === "VERIFIED" && (
                  <Badge variant="success" size="sm">✓ Verified</Badge>
                )}
                {company.verificationStatus === "PENDING" && (
                  <Badge variant="warning" size="sm">Verification pending</Badge>
                )}
                {domainMatches && (
                  <Badge variant="success" size="sm">
                    ✓ Your email domain matches
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        {company.verificationStatus === "VERIFIED" && (
          <Alert variant="info" title="This company is already verified">
            Existing admins can also invite you directly via the team
            page — that path skips the queue. If you know an admin
            here, ask them to invite you. Otherwise, the form below
            lets us verify you and grant access.
          </Alert>
        )}

        <CompanyClaimForm
          companyId={company.id}
          companySlug={company.slug}
          companyName={company.name}
          existingStatus={existing?.status as
            | "PENDING"
            | "APPROVED"
            | "REJECTED"
            | "WITHDRAWN"
            | undefined}
          existingProofText={existing?.proofText}
          existingDesignation={existing?.designation}
          existingDesiredRole={existing?.desiredRole}
          existingWorkEmail={existing?.workEmail}
          existingLinkedinUrl={existing?.linkedinUrl}
          reviewerNote={existing?.reviewerNote}
        />
      </div>
      <SiteFooter />
    </>
  );
}
