import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { EnrichmentProposalStatus, type Prisma } from "@prisma/client";

export const metadata = { title: "Company enrichment queue" };

const STATUS_FILTERS = ["PENDING", "APPROVED", "REJECTED", "ERROR"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isStatusFilter(s: string | undefined): s is StatusFilter {
  return !!s && (STATUS_FILTERS as readonly string[]).includes(s);
}

/**
 * Inverse-coloured chip showing the proposal's status. PENDING is the
 * one admins act on, so it's high-contrast; the others are
 * decorative.
 */
function StatusBadge({ status }: { status: EnrichmentProposalStatus }) {
  const map: Record<EnrichmentProposalStatus, { label: string; variant: "warning" | "success" | "default" | "verified" }> = {
    PENDING: { label: "Pending review", variant: "warning" },
    APPROVED: { label: "Approved", variant: "success" },
    REJECTED: { label: "Rejected", variant: "default" },
    ERROR: { label: "Fetch error", variant: "default" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
}

/**
 * The little confidence indicator next to each proposal — green at
 * 100 (both fetchers landed), amber at 50 (one source), red at 0
 * (which would normally be ERROR).
 */
function ConfidenceChip({ value }: { value: number }) {
  const tone =
    value >= 80 ? "bg-emce-mid text-white"
    : value >= 40 ? "bg-emce-amber-soft text-emce-amber-deep"
    : "bg-emce-red-light text-emce-red-deep";
  return <span className={`inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold ${tone}`}>{value}%</span>;
}

export default async function EnrichmentQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; notice?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const sp = await searchParams;
  const activeStatus: StatusFilter = isStatusFilter(sp.status?.toUpperCase())
    ? (sp.status!.toUpperCase() as StatusFilter)
    : "PENDING";

  // One query for the list + one groupBy for the filter-chip badges.
  // groupBy is dirt-cheap for a ~few-thousand-row table — no need to
  // memoise.
  const where: Prisma.CompanyEnrichmentProposalWhereInput = { status: activeStatus };
  const [proposals, statusCounts] = await Promise.all([
    db.companyEnrichmentProposal.findMany({
      where,
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        company: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            hqLocation: true,
            companyTier: true,
            website: true,
          },
        },
        reviewedBy: {
          select: { name: true, email: true },
        },
      },
    }),
    db.companyEnrichmentProposal.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count._all]),
  ) as Partial<Record<EnrichmentProposalStatus, number>>;

  return (
    <AdminShell>
      <div className="container max-w-6xl py-8 md:py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Company enrichment queue</h1>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Web-fetched proposals (logos + Wikipedia summaries) awaiting admin
              review. Each row shows the diff between what&apos;s currently on the
              company page and what the worker fetched — approve, edit, or
              reject per field.
            </p>
          </div>
        </div>

        {sp.notice && (
          <div className="mt-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            ✓ Proposal {sp.notice}.
          </div>
        )}

        {/* Status filter chips — same pattern as /admin/employers. The
            count badge tells the admin where to focus first. */}
        <nav
          aria-label="Filter proposals by status"
          className="mt-6 flex flex-wrap gap-1.5"
        >
          {STATUS_FILTERS.map((s) => {
            const count = countByStatus[s] ?? 0;
            const isActive = s === activeStatus;
            return (
              <Link
                key={s}
                href={`/admin/companies/enrichment-queue?status=${s}`}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "inline-flex h-10 items-center rounded-md border px-3 text-sm font-extrabold transition",
                  isActive
                    ? "border-emce-dark bg-emce-dark text-white"
                    : "border-emce-border bg-white text-emce-dark hover:border-emce-mid hover:bg-emce-light-soft",
                ].join(" ")}
              >
                <span>{s[0] + s.slice(1).toLowerCase()}</span>
                {count > 0 && (
                  <span className={`ml-1.5 rounded-sm px-1 text-[10px] font-bold ${isActive ? "bg-white/15 text-current" : "bg-emce-light-soft text-emce-text-sec"}`}>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Card className="mt-6 p-0">
          {proposals.length === 0 ? (
            <div className="p-8 text-center text-sm text-emce-text-sec">
              {activeStatus === "PENDING"
                ? "Nothing in the review queue right now. Run the seed script to enqueue a batch:"
                : `No ${activeStatus.toLowerCase()} proposals.`}
              {activeStatus === "PENDING" && (
                <pre className="mx-auto mt-3 max-w-md rounded bg-emce-light-soft p-3 text-left text-xs">
                  pnpm exec tsx scripts/queue-top-100-enrichment.ts
                </pre>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-emce-border">
              {proposals.map((p) => {
                const proposed = (p.proposedFields ?? {}) as Record<string, string | number>;
                const proposedKeys = Object.keys(proposed);
                return (
                  <li key={p.id} className="px-4 py-3">
                    <Link
                      href={`/admin/companies/enrichment-queue/${p.id}`}
                      className="flex items-start gap-3 hover:bg-emce-light-soft -mx-4 px-4 py-1 rounded"
                    >
                      <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                        {p.company.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.company.logoUrl} alt={p.company.name} className="h-full w-full object-cover" />
                        ) : (
                          p.company.name[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="truncate font-bold text-emce-text">{p.company.name}</span>
                          <StatusBadge status={p.status} />
                          <ConfidenceChip value={p.confidence} />
                          {p.company.companyTier && (
                            <Badge variant="default" size="sm" className="text-[10px]">
                              {p.company.companyTier.replace(/_/g, " ").toLowerCase()}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-hint text-emce-text-sec">
                          {p.company.hqLocation ?? "no HQ"}
                          {p.company.website && ` · ${p.company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}`}
                        </p>
                        <p className="mt-1 text-hint text-emce-text-sec">
                          {p.status === EnrichmentProposalStatus.ERROR ? (
                            <span className="text-emce-red-deep">⚠ {p.errorMessage ?? "Worker error"}</span>
                          ) : proposedKeys.length === 0 ? (
                            <span className="text-emce-text-muted italic">No field differs from current data</span>
                          ) : (
                            <>
                              Proposes:{" "}
                              <span className="font-bold text-emce-text">
                                {proposedKeys.map((k) => k).join(", ")}
                              </span>
                            </>
                          )}
                        </p>
                        {p.reviewedBy && (
                          <p className="mt-0.5 text-hint text-emce-text-muted">
                            Reviewed by {p.reviewedBy.name ?? p.reviewedBy.email} ·{" "}
                            {p.reviewedAt ? new Date(p.reviewedAt).toLocaleString() : ""}
                          </p>
                        )}
                      </div>
                      <div className="self-center">
                        <Button asChild size="sm" variant="outline">
                          <span>Review →</span>
                        </Button>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <p className="mt-3 text-hint text-emce-text-sec">
          Showing {proposals.length} {activeStatus.toLowerCase()} proposal{proposals.length === 1 ? "" : "s"}
          {proposals.length === 100 ? " (capped at 100 — paginate if you need more)" : ""}.
        </p>
      </div>
    </AdminShell>
  );
}
