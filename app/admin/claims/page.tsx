import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Company claims" };
export const dynamic = "force-dynamic";

const TABS = [
  { value: "PENDING", label: "Pending review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WITHDRAWN", label: "Withdrawn" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * Admin queue for reviewing company-membership claims. Default tab
 * is PENDING because that's what admins act on; the others are
 * audit + history surfaces.
 *
 * Each row carries the proof signals (email-domain match indicator,
 * LinkedIn URL presence, claimant's account age) so the admin can
 * triage at-a-glance without opening every detail page.
 */
export default async function AdminClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Tab }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab =
    sp.status && TABS.some((t) => t.value === sp.status) ? sp.status : "PENDING";

  const [claims, counts] = await Promise.all([
    db.companyClaim.findMany({
      where: { status: tab },
      orderBy: tab === "PENDING" ? { createdAt: "asc" } : { updatedAt: "desc" },
      take: 100,
      include: {
        company: {
          select: {
            slug: true,
            name: true,
            logoUrl: true,
            verificationStatus: true,
            emailDomains: true,
          },
        },
        claimant: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            emailVerifiedAt: true,
            candidateProfile: {
              select: { slug: true, profilePhotoUrl: true, headline: true },
            },
          },
        },
        reviewedBy: { select: { name: true, email: true } },
      },
    }),
    db.companyClaim.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8">
        <div>
          <h1 className="text-dashboard text-emce-text">Company claims</h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Approve or reject employee-membership claims. Approval grants
            the user EmployerProfile + (optionally) flips the company to
            VERIFIED.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/claims?status=${t.value}`}
              aria-pressed={tab === t.value}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                tab === t.value
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {t.label} ({countMap[t.value] ?? 0})
            </Link>
          ))}
        </div>

        {claims.length === 0 ? (
          <EmptyState
            icon="🪪"
            title={`No claims in ${tab.toLowerCase()}`}
            body="Claims arrive when users file via /company/[slug]/claim."
          />
        ) : (
          <ul className="mt-5 space-y-3">
            {claims.map((c) => {
              const claimantDomain = c.claimant.email.split("@")[1]?.toLowerCase() ?? "";
              const claimedDomain = (c.workEmail ?? "")
                .split("@")[1]
                ?.toLowerCase() ?? "";
              const domainMatch =
                (claimedDomain && c.company.emailDomains.includes(claimedDomain)) ||
                (claimantDomain && c.company.emailDomains.includes(claimantDomain));
              const accountAgeDays = Math.floor(
                (Date.now() - c.claimant.createdAt.getTime()) / (24 * 60 * 60 * 1000),
              );
              return (
                <li key={c.id}>
                  <Link href={`/admin/claims/${c.id}`} className="block">
                    <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                      <div className="flex items-start gap-3">
                        <Avatar src={c.company.logoUrl} name={c.company.name} size="md" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-bold text-emce-text">
                              {c.company.name}
                            </span>
                            {c.company.verificationStatus === "VERIFIED" && (
                              <Badge variant="success" size="sm">Verified company</Badge>
                            )}
                            {c.company.verificationStatus === "UNVERIFIED" && (
                              <Badge variant="outline" size="sm">Unverified</Badge>
                            )}
                            {domainMatch && (
                              <Badge variant="success" size="sm">
                                ✓ Domain match
                              </Badge>
                            )}
                            {!c.claimant.emailVerifiedAt && (
                              <Badge variant="warning" size="sm">
                                Email unverified
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-emce-text">
                            <strong>{c.claimant.name ?? c.claimant.email}</strong>
                            {c.claimant.candidateProfile?.headline && (
                              <span className="text-emce-text-sec">
                                {" — "}{c.claimant.candidateProfile.headline}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-hint text-emce-text-muted">
                            {c.claimant.email}
                            {c.designation && <> · {c.designation}</>}
                            {" · "}wants {c.desiredRole.toLowerCase()}
                            {" · "}account {accountAgeDays}d old
                            {" · "}filed {relativeTime(c.createdAt)}
                          </p>
                          <p className="mt-2 line-clamp-2 text-hint text-emce-text-sec">
                            {c.proofText}
                          </p>
                        </div>
                        <span className="self-center text-hint text-emce-dark">Review →</span>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
