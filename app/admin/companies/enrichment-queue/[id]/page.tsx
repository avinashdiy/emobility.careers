import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { approveProposal, rejectProposal, refetchProposal } from "../actions";

export const metadata = { title: "Review enrichment proposal" };

// Friendly labels for each field key — drives the row headings in the
// diff table. Anything not in this map falls back to the raw key.
const FIELD_LABELS: Record<string, string> = {
  logoUrl: "Logo",
  description: "Description (short tagline)",
  about: "About (long-form)",
  foundedYear: "Founded year",
  linkedinUrl: "LinkedIn URL",
  twitterUrl: "Twitter / X URL",
  facebookUrl: "Facebook URL",
  website: "Website",
};

/**
 * Side-by-side diff for a single field. "Current" = what's on the
 * Company row today; "Proposed" = what the worker fetched. Admin can
 * edit the proposed value before approving, or check "drop" to skip
 * this field entirely.
 *
 * For logoUrl we render the image preview; for everything else we use
 * a Textarea so long prose is editable inline.
 */
function FieldDiffRow({
  fieldKey,
  current,
  proposed,
}: {
  fieldKey: string;
  current: string | number | null;
  proposed: string | number;
}) {
  const isLogo = fieldKey === "logoUrl";
  const isLong = fieldKey === "about" || fieldKey === "description";
  const label = FIELD_LABELS[fieldKey] ?? fieldKey;

  return (
    <div className="grid gap-3 border-t border-emce-border py-4 first:border-t-0 md:grid-cols-[max-content_1fr_1fr_max-content]">
      <div className="md:w-40">
        <p className="text-sm font-bold text-emce-text">{label}</p>
        <code className="text-hint text-emce-text-muted">{fieldKey}</code>
      </div>
      <div className="rounded border border-emce-border bg-emce-light-soft p-3">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
          Current
        </p>
        {isLogo ? (
          current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={String(current)} alt="current" className="mt-1 h-20 w-20 rounded border border-emce-border bg-white object-contain p-1" />
          ) : (
            <p className="mt-1 text-sm italic text-emce-text-muted">no logo</p>
          )
        ) : (
          <p className="mt-1 break-words text-sm text-emce-text-sec">
            {current === null || current === "" ? <span className="italic text-emce-text-muted">unset</span> : String(current)}
          </p>
        )}
      </div>
      <div className="rounded border border-emce-mid bg-white p-3">
        <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
          Proposed
        </p>
        {isLogo ? (
          <div className="mt-1 flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={String(proposed)} alt="proposed" className="h-20 w-20 rounded border border-emce-border bg-white object-contain p-1" />
            {/* Hidden input carries the proposed URL since logos
                aren't user-editable inline. Admin can still "drop"
                via the checkbox on the right. */}
            <input type="hidden" name={`field_${fieldKey}`} value={String(proposed)} />
          </div>
        ) : isLong ? (
          <Textarea
            name={`field_${fieldKey}`}
            defaultValue={String(proposed)}
            rows={4}
            className="mt-1 w-full text-sm"
          />
        ) : (
          <Input
            name={`field_${fieldKey}`}
            defaultValue={String(proposed)}
            className="mt-1 w-full text-sm"
          />
        )}
      </div>
      <label className="flex items-center gap-2 self-end md:self-start md:pt-7">
        <input type="checkbox" name={`drop_${fieldKey}`} value="1" className="h-4 w-4" />
        <span className="text-hint text-emce-text-sec">Drop</span>
      </label>
    </div>
  );
}

export default async function ReviewProposalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const sp = await searchParams;

  const proposal = await db.companyEnrichmentProposal.findUnique({
    where: { id },
    include: {
      company: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          description: true,
          about: true,
          website: true,
          foundedYear: true,
          linkedinUrl: true,
          twitterUrl: true,
          facebookUrl: true,
          hqLocation: true,
          companyTier: true,
        },
      },
      reviewedBy: { select: { name: true, email: true } },
    },
  });

  if (!proposal) notFound();

  const proposed = (proposal.proposedFields ?? {}) as Record<string, string | number>;
  const raw = (proposal.rawSources ?? {}) as Record<string, unknown>;
  const proposedKeys = Object.keys(proposed);

  // Current values keyed for the diff render. We index by the field
  // names used in `proposedFields` so the order matches the proposal.
  const current: Record<string, string | number | null> = {
    logoUrl: proposal.company.logoUrl,
    description: proposal.company.description,
    about: proposal.company.about,
    foundedYear: proposal.company.foundedYear,
    linkedinUrl: proposal.company.linkedinUrl,
    twitterUrl: proposal.company.twitterUrl,
    facebookUrl: proposal.company.facebookUrl,
    website: proposal.company.website,
  };

  const wiki = raw.wikipedia as
    | { title?: string; url?: string; shortDescription?: string; extract?: string }
    | undefined;
  const logoSrc = raw.logo_dev as { url?: string; bytes?: number } | undefined;

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8 md:py-10">
        <nav className="mb-2 text-hint text-emce-text-sec">
          <Link href="/admin/companies/enrichment-queue" className="hover:underline">
            ← Back to queue
          </Link>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">{proposal.company.name}</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              {proposal.company.hqLocation}
              {proposal.company.website && (
                <> · <a href={proposal.company.website} target="_blank" rel="noopener noreferrer" className="hover:underline">{proposal.company.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="text-[10px]">{proposal.status}</Badge>
            <Badge variant="default" className="text-[10px]">{proposal.confidence}% confidence</Badge>
            <Button asChild variant="outline" size="sm">
              <Link href={`/company/${proposal.company.slug}`} target="_blank">
                View public page ↗
              </Link>
            </Button>
          </div>
        </div>

        {sp.notice && (
          <div className="mt-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            ✓ Proposal {sp.notice}.
          </div>
        )}

        {/* Sources strip — shows where each piece came from. The
            "Wikipedia: <title>" link lets the admin sanity-check the
            article before approving. */}
        <Card className="mt-6 p-4">
          <p className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Sources
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {wiki?.title ? (
              <li>
                📖 <span className="font-bold">Wikipedia:</span>{" "}
                <a
                  href={wiki.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emce-dark hover:underline"
                >
                  {wiki.title}
                </a>
                {wiki.shortDescription && <span className="text-emce-text-sec"> — {wiki.shortDescription}</span>}
              </li>
            ) : (
              <li className="text-emce-text-muted">📖 Wikipedia: no matching article</li>
            )}
            {logoSrc?.url ? (
              <li>
                🖼️ <span className="font-bold">Logo.dev:</span>{" "}
                <a href={logoSrc.url} target="_blank" rel="noopener noreferrer" className="text-emce-dark hover:underline">
                  fetched image ({Math.round((logoSrc.bytes ?? 0) / 1024)} KB)
                </a>
              </li>
            ) : (
              <li className="text-emce-text-muted">🖼️ Logo.dev: no logo returned</li>
            )}
          </ul>
        </Card>

        {/* APPROVE flow — one form covers all diff rows. Each field
            input is named field_<key>; the "Drop" checkboxes are
            named drop_<key>. The action serialises both into the
            Company.update payload. */}
        {proposal.status === "PENDING" && proposedKeys.length > 0 && (
          <form action={approveProposal} className="mt-6">
            <input type="hidden" name="proposalId" value={proposal.id} />
            <Card className="p-4 md:p-6">
              <h2 className="text-section font-extrabold text-emce-darkest">
                Diff ({proposedKeys.length} field{proposedKeys.length === 1 ? "" : "s"} differ)
              </h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Edit any proposed value inline, or check &ldquo;Drop&rdquo; to skip a field on approval.
              </p>
              <div className="mt-4">
                {proposedKeys.map((key) => (
                  <FieldDiffRow
                    key={key}
                    fieldKey={key}
                    current={current[key] ?? null}
                    proposed={proposed[key]}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                <Button type="submit" size="sm">
                  ✓ Approve &amp; apply
                </Button>
              </div>
            </Card>
          </form>
        )}

        {/* No-op case — worker ran but nothing differed. Admin should
            usually just reject + move on. */}
        {proposal.status === "PENDING" && proposedKeys.length === 0 && (
          <Card className="mt-6 border-emce-border p-6 text-center">
            <p className="text-sm text-emce-text-sec">
              No fields differ from the current company data. Mark this proposal
              as rejected to clear it from the queue, or re-fetch if you think
              the source might have improved.
            </p>
          </Card>
        )}

        {/* REJECT + RE-FETCH are separate forms so the approve form
            isn't accidentally submitted. */}
        {proposal.status === "PENDING" && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form action={rejectProposal} className="rounded-md border border-emce-border bg-white p-4">
              <input type="hidden" name="proposalId" value={proposal.id} />
              <p className="text-sm font-bold text-emce-text">Reject this proposal</p>
              <Textarea
                name="reason"
                placeholder="Reason (optional, but useful for audit) — e.g. 'wrong Wikipedia article, this is the Indian subsidiary'"
                rows={2}
                className="mt-2 w-full text-sm"
              />
              <Button type="submit" variant="outline" size="sm" className="mt-2 text-emce-red-deep">
                ✗ Reject
              </Button>
            </form>
            <form action={refetchProposal} className="rounded-md border border-emce-border bg-white p-4">
              <input type="hidden" name="proposalId" value={proposal.id} />
              <p className="text-sm font-bold text-emce-text">Re-fetch from sources</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Re-runs Logo.dev + Wikipedia for this company. Replaces this
                proposal with a fresh one.
              </p>
              <Button type="submit" variant="outline" size="sm" className="mt-2">
                🔄 Re-fetch
              </Button>
            </form>
          </div>
        )}

        {/* APPROVED / REJECTED / ERROR — show the audit trail */}
        {proposal.status !== "PENDING" && (
          <Card className="mt-6 p-6">
            <h2 className="text-section font-extrabold text-emce-darkest">
              Audit trail
            </h2>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="font-bold text-emce-text">Status</dt>
              <dd>{proposal.status}</dd>
              <dt className="font-bold text-emce-text">Reviewed by</dt>
              <dd>
                {proposal.reviewedBy?.name ?? proposal.reviewedBy?.email ?? "—"}{" "}
                {proposal.reviewedAt ? `at ${new Date(proposal.reviewedAt).toLocaleString()}` : ""}
              </dd>
              {proposal.rejectionReason && (
                <>
                  <dt className="font-bold text-emce-text">Reason</dt>
                  <dd>{proposal.rejectionReason}</dd>
                </>
              )}
              {proposal.appliedFields && (
                <>
                  <dt className="font-bold text-emce-text">Applied fields</dt>
                  <dd>
                    <pre className="overflow-auto rounded bg-emce-light-soft p-2 text-xs">
                      {JSON.stringify(proposal.appliedFields, null, 2)}
                    </pre>
                  </dd>
                </>
              )}
              {proposal.errorMessage && (
                <>
                  <dt className="font-bold text-emce-text">Error</dt>
                  <dd className="text-emce-red-deep">{proposal.errorMessage}</dd>
                </>
              )}
            </dl>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
