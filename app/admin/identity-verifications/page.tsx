import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { reviewIDVerification } from "@/server/identity/actions";
import { relativeTime } from "@/lib/utils";
import { CountryFlag } from "@/components/profile/CountryFlag";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

export const metadata = { title: "ID verifications" };

const TABS = ["PENDING", "VERIFIED", "REJECTED", "NONE"] as const;
type Tab = (typeof TABS)[number];

export default async function IDVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; id?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Tab)
    : "PENDING";

  const [rows, counts] = await Promise.all([
    db.candidateProfile.findMany({
      where: { idVerificationStatus: tab },
      orderBy: [
        // PENDING: oldest first (FIFO queue). Others: newest first
        // (most recently actioned at the top).
        tab === "PENDING"
          ? { idVerificationSubmittedAt: "asc" }
          : { idVerificationReviewedAt: "desc" },
      ],
      take: 100,
      select: {
        id: true,
        slug: true,
        firstName: true,
        lastName: true,
        headline: true,
        country: true,
        city: true,
        location: true,
        profilePhotoUrl: true,
        idVerificationStatus: true,
        idVerificationDocUrl: true,
        idVerificationSubmittedAt: true,
        idVerificationReviewedAt: true,
        idVerificationNotes: true,
        user: { select: { email: true, name: true } },
      },
    }),
    db.candidateProfile.groupBy({
      by: ["idVerificationStatus"],
      _count: true,
    }),
  ]);

  // Doc links go through the admin proxy at `/api/admin/id-document`
  // — a server-side route that re-validates admin auth on every fetch
  // and streams the file from MinIO. This avoids two failure modes
  // of presigned URLs in production:
  //   1. The presigned URL signs against the internal MinIO endpoint
  //      (e.g. http://minio:9000) which the admin's browser can't reach.
  //   2. Presigned URLs are bearer tokens — once issued, anyone with
  //      the URL can fetch the doc until expiry. The proxy re-validates
  //      session on every request, so a leaked URL is useless.
  // Each fetch is audit-logged inside the route.
  const docLinks: Record<string, string | null> = Object.fromEntries(
    rows.map((r) => [
      r.id,
      r.idVerificationDocUrl
        ? `/api/admin/id-document?profileId=${encodeURIComponent(r.id)}`
        : null,
    ]),
  );

  const countMap = Object.fromEntries(
    counts.map((c) => [c.idVerificationStatus, c._count]),
  );

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <div className="flex items-center gap-2">
          <h1 className="text-dashboard text-emce-text">ID verifications</h1>
          <VerifiedBadge size={22} />
        </div>
        <p className="mt-1 text-sm text-emce-text-sec">
          Review candidate-submitted government IDs (Aadhar by default). Approving
          flips the public blue checkmark on. The doc image stays in our private
          bucket — every doc view is admin-gated and audit-logged.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {TABS.map((s) => (
            <Link
              key={s}
              href={`/admin/identity-verifications?status=${s}`}
              aria-pressed={tab === s}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                tab === s
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {s} ({countMap[s] ?? 0})
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>✓</div>
            <p className="mt-3 text-section text-emce-text">
              Nothing in {tab.toLowerCase()}.
            </p>
            {tab === "PENDING" && (
              <p className="mt-1 text-hint text-emce-text-sec">
                Inbox is clear. Take a break.
              </p>
            )}
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Link
                          href={`/${r.slug}`}
                          className="text-section font-bold text-emce-text hover:underline"
                        >
                          {r.firstName} {r.lastName ?? ""}
                        </Link>
                        {r.idVerificationStatus === "VERIFIED" && (
                          <VerifiedBadge size={16} />
                        )}
                        {r.country && <CountryFlag code={r.country} size="md" />}
                      </div>
                      <p className="text-hint text-emce-text-sec">
                        {r.user.email}
                        {r.headline ? ` · ${r.headline}` : ""}
                      </p>
                      <p className="text-hint text-emce-text-muted">
                        {r.location ? `${r.location} · ` : ""}
                        {r.idVerificationSubmittedAt && (
                          <>Submitted {relativeTime(r.idVerificationSubmittedAt)}</>
                        )}
                        {r.idVerificationReviewedAt && (
                          <> · Reviewed {relativeTime(r.idVerificationReviewedAt)}</>
                        )}
                      </p>
                      {r.idVerificationNotes && (
                        <p className="mt-2 rounded-md bg-emce-light-soft p-2 text-hint text-emce-text-sec">
                          <strong>Notes:</strong> {r.idVerificationNotes}
                        </p>
                      )}
                      {docLinks[r.id] ? (
                        <a
                          href={docLinks[r.id] ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-block text-hint font-bold text-emce-dark hover:underline"
                        >
                          View ID document →
                        </a>
                      ) : tab === "PENDING" ? (
                        <Badge variant="warning" className="mt-2">
                          No document — bypass-only
                        </Badge>
                      ) : null}
                    </div>
                    {tab === "PENDING" && (
                      <div className="flex flex-col gap-2 sm:w-64">
                        <form action={reviewIDVerification} className="space-y-2">
                          <input type="hidden" name="profileId" value={r.id} />
                          <Textarea
                            name="notes"
                            rows={2}
                            placeholder="Reviewer notes (optional)"
                            aria-label="Reviewer notes"
                          />
                          <input type="hidden" name="action" value="approve" />
                          <ConfirmSubmit
                            confirm={`Verify ${r.firstName}? They'll get the blue checkmark across the platform.`}
                            size="sm"
                            className="w-full"
                          >
                            Approve
                          </ConfirmSubmit>
                        </form>
                        <form action={reviewIDVerification}>
                          <input type="hidden" name="profileId" value={r.id} />
                          <input type="hidden" name="action" value="reject" />
                          <Button type="submit" size="sm" variant="ghost" className="w-full">
                            Reject
                          </Button>
                        </form>
                      </div>
                    )}
                    {tab !== "PENDING" && tab !== "VERIFIED" && (
                      <div className="flex flex-col gap-2 sm:w-64">
                        {/* Bypass — admin can verify a trusted candidate
                            without a doc upload. Useful for partners,
                            DIYguru staff, panel speakers etc. */}
                        <form action={reviewIDVerification} className="space-y-2">
                          <input type="hidden" name="profileId" value={r.id} />
                          <input type="hidden" name="action" value="bypass" />
                          <Textarea
                            name="notes"
                            rows={2}
                            placeholder="Reason (audit-logged)"
                            aria-label="Bypass reason"
                          />
                          <ConfirmSubmit
                            confirm={`Bypass-verify ${r.firstName}? This will be audit-logged separately from doc-backed approvals.`}
                            size="sm"
                            variant="outline"
                            className="w-full"
                          >
                            Bypass-verify
                          </ConfirmSubmit>
                        </form>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
