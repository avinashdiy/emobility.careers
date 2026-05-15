import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/layout/employer-shell";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Contact requests" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "default" | "warning" | "success" | "danger" | "outline"> = {
  PENDING: "warning",
  GRANTED: "success",
  DENIED: "danger",
  REVOKED: "outline",
  EXPIRED: "outline",
};

const TABS = ["GRANTED", "PENDING", "DENIED", "ALL"] as const;
type Tab = (typeof TABS)[number];

export default async function EmployerContactRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/contact-requests");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as Tab)
    : "GRANTED";

  // Counts per status — single groupBy. Drives the tab badges.
  const counts = await db.contactShareRequest.groupBy({
    by: ["status"],
    where: { requesterUserId: session.user.id },
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  // Filter: GRANTED/PENDING/DENIED show only that status; ALL shows
  // every row including REVOKED + EXPIRED for full audit history.
  const where =
    tab === "ALL"
      ? { requesterUserId: session.user.id }
      : { requesterUserId: session.user.id, status: tab };

  const rows = await db.contactShareRequest.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      target: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          image: true,
          candidateProfile: {
            select: {
              slug: true,
              firstName: true,
              lastName: true,
              headline: true,
              profilePhotoUrl: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      application: {
        select: {
          id: true,
          job: { select: { id: true, slug: true, title: true } },
        },
      },
    },
  });

  return (
    <EmployerShell>
      <div className="container max-w-4xl py-10">
        <h1 className="text-dashboard text-emce-text">Contact requests</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Candidates you've asked to share their email and phone. Granted rows
          unlock contact across the talent search, ATS, and public profile —
          but only for you, not your teammates. Pending rows expire after 30
          days if the candidate doesn't respond.
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/employer/contact-requests?status=${t}`}
              aria-pressed={tab === t}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                tab === t
                  ? "bg-emce-dark text-emce-light"
                  : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {t}{" "}
              {t === "ALL"
                ? `(${rows.length})`
                : countMap[t] !== undefined
                  ? `(${countMap[t]})`
                  : ""}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>—</div>
            <p className="mt-3 text-section text-emce-text">
              {tab === "PENDING"
                ? "No pending requests right now."
                : tab === "GRANTED"
                  ? "No granted shares yet."
                  : tab === "DENIED"
                    ? "No declined requests."
                    : "No contact requests yet."}
            </p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Hit &ldquo;Request contact&rdquo; on a candidate&apos;s public profile when you&apos;d
              like their email + phone.
            </p>
            {/* Take the recruiter straight to the candidate browse —
                the previous empty state only described the workflow,
                making a one-click bounce-out impossible. */}
            <div className="mt-4">
              <Button asChild>
                <Link href="/employer/candidates">Browse candidates →</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((r) => {
              const cp = r.target.candidateProfile;
              const fullName = cp
                ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
                : r.target.name ?? "A candidate";
              // The recruiter is the OWNER of this request, so showing
              // the candidate's email + phone in the GRANTED rows is
              // the entire point. We pull from CandidateProfile first
              // (the canonical contact for the platform), falling back
              // to User-level fields.
              const email = cp?.email ?? r.target.email;
              const phone = cp?.phone ?? r.target.phone;
              return (
                <li key={r.id}>
                  <Card>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Avatar
                        src={cp?.profilePhotoUrl ?? r.target.image}
                        name={fullName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          {cp ? (
                            <Link
                              href={`/${cp.slug}`}
                              className="font-bold text-emce-text hover:underline"
                            >
                              {fullName}
                            </Link>
                          ) : (
                            <span className="font-bold text-emce-text">{fullName}</span>
                          )}
                          <Badge variant={STATUS_TONE[r.status] ?? "outline"}>
                            {r.status}
                          </Badge>
                          <span className="text-hint text-emce-text-muted">
                            {relativeTime(r.updatedAt)}
                          </span>
                        </div>
                        {cp?.headline && (
                          <p className="text-hint text-emce-text-sec">{cp.headline}</p>
                        )}
                        {r.application && (
                          <p className="mt-1 text-hint text-emce-text-muted">
                            About application to{" "}
                            <Link
                              href={`/employer/jobs/${r.application.job.id}/ats`}
                              className="font-bold text-emce-dark hover:underline"
                            >
                              {r.application.job.title}
                            </Link>
                          </p>
                        )}
                        {r.message && (
                          <p className="mt-2 rounded-md bg-emce-light-soft p-2 text-sm text-emce-text-sec">
                            <strong>Your message:</strong> {r.message}
                          </p>
                        )}
                        {r.status === "DENIED" && r.denyReason && (
                          <p className="mt-2 rounded-md bg-emce-red-light p-2 text-sm text-emce-red-deep">
                            <strong>Their reason:</strong> {r.denyReason}
                          </p>
                        )}

                        {/* Granted → show contact + WhatsApp link */}
                        {r.status === "GRANTED" && (email || phone) && (
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-emce-border pt-2 text-sm">
                            {email && (
                              <a
                                href={`mailto:${email}`}
                                className="font-bold text-emce-dark hover:underline"
                              >
                                ✉️ {email}
                              </a>
                            )}
                            {phone && (
                              <a
                                href={`tel:${phone.replace(/\s/g, "")}`}
                                className="font-bold text-emce-dark hover:underline"
                              >
                                📞 {phone}
                              </a>
                            )}
                          </div>
                        )}
                        {/* Pending → friendly note that we're waiting */}
                        {r.status === "PENDING" && (
                          <p className="mt-2 text-hint text-emce-text-muted">
                            Awaiting their response · expires {relativeTime(r.expiresAt)}
                          </p>
                        )}
                        {/* Revoked → explain status, suggest next step */}
                        {r.status === "REVOKED" && (
                          <p className="mt-2 text-hint text-emce-text-muted">
                            They revoked access. Message them in-app instead.
                          </p>
                        )}
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
