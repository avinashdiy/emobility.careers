import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import {
  setInstitutionVerification,
  adminEditInstitution,
  deleteInstitution,
} from "@/server/admin/institution-actions";
import { relativeTime } from "@/lib/utils";
import type { InstitutionVerification } from "@prisma/client";

export const metadata: Metadata = { title: "Institutions · Admin" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["ALL", "PENDING", "UNVERIFIED", "VERIFIED", "REJECTED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const INSTITUTION_TYPES = [
  "UNIVERSITY",
  "COLLEGE",
  "SCHOOL",
  "ITI",
  "POLYTECHNIC",
  "RESEARCH_INSTITUTE",
  "TRAINING_CENTER",
  "OTHER",
] as const;

/**
 * Admin moderation queue for Institution rows. Candidate-submitted
 * institutions land in PENDING via createInstitutionLite (see
 * server/entities/actions.ts) and surface here. Approving flips the
 * row to VERIFIED — the public /institutions/<slug> page becomes
 * navigable and the row's chip on candidate profiles renders as a
 * hyperlink instead of plain text.
 *
 * Mirrors /admin/employers UX: status-filter chips with counts,
 * inline reject-with-reason disclosure, inline edit form so admin
 * can fix capitalisation / set a missing type before approving.
 *
 * Distinct from /admin/colleges — that queue is about TPO sign-ups
 * (User.isPlacementOfficer access). This queue is about the
 * Institution entity itself (the page at /institutions/<slug>).
 */
export default async function AdminInstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    error?: string;
    notice?: string;
  }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  // Default to ALL — admins want the full list in front of them by
  // default (matches /admin/employers behaviour). PENDING tab is one
  // click away and the sidebar badge surfaces the actionable count.
  const activeStatus: StatusFilter = (STATUS_FILTERS as readonly string[]).includes(
    (sp.status ?? "").toUpperCase(),
  )
    ? ((sp.status ?? "ALL").toUpperCase() as StatusFilter)
    : "ALL";

  const q = sp.q?.trim() ?? "";

  const [institutions, statusCounts] = await Promise.all([
    db.institution.findMany({
      where: {
        ...(activeStatus === "ALL"
          ? {}
          : { verificationStatus: activeStatus as InstitutionVerification }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      // PENDING first when ALL — admin attention items lead.
      // Otherwise alpha by name so admins can scan a long verified
      // list predictably.
      orderBy:
        activeStatus === "ALL"
          ? [{ verificationStatus: "asc" }, { createdAt: "desc" }]
          : activeStatus === "PENDING" || activeStatus === "UNVERIFIED"
            ? [{ createdAt: "desc" }]
            : [{ name: "asc" }],
      take: 200,
      select: {
        id: true,
        slug: true,
        name: true,
        type: true,
        city: true,
        state: true,
        country: true,
        website: true,
        about: true,
        verificationStatus: true,
        createdById: true,
        createdAt: true,
        emailDomains: true,
        aliases: true,
        _count: { select: { educationLinks: true } },
      },
    }),
    db.institution.groupBy({
      by: ["verificationStatus"],
      _count: { _all: true },
    }),
  ]);

  // Resolve submitter usernames in a single batch — Institution
  // doesn't define a `createdBy` relation in schema.prisma, so we
  // can't include it directly. Looking these up here keeps the per-row
  // render simple and avoids N+1 queries.
  const submitterIds = Array.from(
    new Set(institutions.map((i) => i.createdById).filter(Boolean)),
  ) as string[];
  const submitters = submitterIds.length
    ? await db.user.findMany({
        where: { id: { in: submitterIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const submitterById = new Map(submitters.map((u) => [u.id, u]));

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.verificationStatus, s._count._all]),
  ) as Partial<Record<InstitutionVerification, number>>;
  const totalCount = statusCounts.reduce((acc, s) => acc + s._count._all, 0);

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Moderation queue"
          title="Institutions"
          subtitle={`User-submitted colleges, universities, ITIs and training centres awaiting review. ${
            countByStatus.PENDING ?? 0
          } pending · ${totalCount} total.`}
        />

        {sp.error && (
          <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}
        {sp.notice && (
          <div className="rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm text-emce-text">
            ✓ {sp.notice}
          </div>
        )}

        {/* Status filter chips with counts — same affordance as
            /admin/employers so the admin's mental model is consistent
            across moderation queues. */}
        <nav className="flex flex-wrap gap-1 rounded-md border border-emce-border p-1">
          {STATUS_FILTERS.map((s) => {
            const count =
              s === "ALL" ? totalCount : countByStatus[s as InstitutionVerification] ?? 0;
            const active = s === activeStatus;
            return (
              <Link
                key={s}
                href={
                  s === "PENDING"
                    ? "/admin/institutions"
                    : `/admin/institutions?status=${s}`
                }
                className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold ${
                  active
                    ? "bg-emce-light-soft text-emce-darkest"
                    : "text-emce-text-sec hover:text-emce-text"
                }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                <span className="ml-1.5 text-[10px] text-emce-text-muted">
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Search — filtered alongside the status. Helps admin find a
            specific submission without scrolling through 200 rows. */}
        <Card className="p-4">
          <form action="/admin/institutions" method="get" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="status" value={activeStatus} />
            <div className="min-w-[220px] flex-1">
              <Label htmlFor="q">Search by name, slug, or city</Label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="IIT Bombay, mit-manipal, Pune"
                maxLength={120}
              />
            </div>
            <SubmitButton size="sm" variant="outline">
              Search
            </SubmitButton>
            {q && (
              <Link
                href={`/admin/institutions?status=${activeStatus}`}
                className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
              >
                Clear
              </Link>
            )}
          </form>
        </Card>

        {institutions.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-body text-emce-text-sec">
              {activeStatus === "PENDING"
                ? "No institutions awaiting review. 🎉"
                : `No ${activeStatus.toLowerCase()} institutions${q ? " match your search" : ""}.`}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {institutions.map((inst) => {
              const submitter = inst.createdById
                ? submitterById.get(inst.createdById)
                : null;
              const linkCount = inst._count.educationLinks;

              return (
                <li key={inst.id}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/institutions/${inst.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-emce-text hover:underline"
                          >
                            {inst.name}
                          </Link>
                          <Badge
                            variant={
                              inst.verificationStatus === "VERIFIED"
                                ? "success"
                                : inst.verificationStatus === "PENDING"
                                  ? "warning"
                                  : inst.verificationStatus === "REJECTED"
                                    ? "danger"
                                    : "outline"
                            }
                          >
                            {inst.verificationStatus}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-hint text-emce-text-sec">
                          {inst.type.replace("_", " ")}
                          {[inst.city, inst.state].filter(Boolean).length > 0 &&
                            " · " +
                              [inst.city, inst.state].filter(Boolean).join(", ")}
                          {" · "}
                          {linkCount} candidate{linkCount === 1 ? "" : "s"} linked
                          {" · added "}
                          {relativeTime(inst.createdAt)}
                        </p>
                        {inst.website && (
                          <p className="text-hint text-emce-text-muted">
                            <a
                              href={inst.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {inst.website.replace(/^https?:\/\//, "")} ↗
                            </a>
                          </p>
                        )}
                        {inst.about && (
                          <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
                            {inst.about}
                          </p>
                        )}
                        {/* Surface who submitted the row — gives the admin
                            a fast path to message the candidate if the
                            submission needs follow-up. */}
                        {submitter && (
                          <p className="mt-1 text-hint text-emce-text-muted">
                            Submitted by{" "}
                            <Link
                              href={`/admin/users?q=${encodeURIComponent(submitter.email ?? "")}`}
                              className="font-bold text-emce-dark hover:underline"
                            >
                              {submitter.name ?? submitter.email}
                            </Link>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {inst.verificationStatus !== "VERIFIED" && (
                          <form action={setInstitutionVerification}>
                            <input type="hidden" name="institutionId" value={inst.id} />
                            <input type="hidden" name="status" value="VERIFIED" />
                            <Button type="submit" size="sm">
                              ✓ Approve
                            </Button>
                          </form>
                        )}
                        {inst.verificationStatus !== "REJECTED" && (
                          <details className="relative">
                            <summary className="inline-flex cursor-pointer list-none items-center justify-center rounded bg-emce-red px-3 py-1.5 text-xs font-bold text-white hover:bg-emce-red/90">
                              Reject
                            </summary>
                            <form
                              action={setInstitutionVerification}
                              className="absolute right-0 top-full z-10 mt-1 w-72 rounded-md border border-emce-border bg-white p-3 shadow-emce-lg"
                            >
                              <input
                                type="hidden"
                                name="institutionId"
                                value={inst.id}
                              />
                              <input type="hidden" name="status" value="REJECTED" />
                              <label
                                className="text-xs font-bold text-emce-text"
                                htmlFor={`reason-${inst.id}`}
                              >
                                Reason (10+ chars, logged for submitter)
                              </label>
                              <textarea
                                id={`reason-${inst.id}`}
                                name="reason"
                                required
                                minLength={10}
                                maxLength={500}
                                rows={3}
                                placeholder={`Why reject "${inst.name}"? e.g. Duplicate of "Indian Institute of Technology Bombay" (iit-bombay). Spam / not a real institution.`}
                                className="mt-1 w-full rounded border border-emce-border bg-white p-2 text-xs text-emce-text outline-none focus:border-emce-mid"
                              />
                              <div className="mt-2 flex justify-end">
                                <Button type="submit" size="sm" variant="destructive">
                                  Send rejection
                                </Button>
                              </div>
                            </form>
                          </details>
                        )}
                        {inst.verificationStatus === "REJECTED" && (
                          <form action={setInstitutionVerification}>
                            <input type="hidden" name="institutionId" value={inst.id} />
                            <input type="hidden" name="status" value="PENDING" />
                            <Button type="submit" size="sm" variant="outline">
                              Reopen
                            </Button>
                          </form>
                        )}
                        {/* Permanent delete — refused when candidates
                            have linked their Education to this row (the
                            server action returns an error redirect with
                            the conflict count). For deduping a row with
                            attached candidates, use the dedupe-diyguru
                            pattern to migrate FKs first. */}
                        <form action={deleteInstitution}>
                          <input type="hidden" name="institutionId" value={inst.id} />
                          <ConfirmSubmit
                            confirm={`Permanently delete "${inst.name}"? This cannot be undone.${
                              linkCount > 0
                                ? ` Note: ${linkCount} candidate Education link${linkCount === 1 ? "" : "s"} attached — deletion will be blocked.`
                                : ""
                            }`}
                            size="sm"
                            variant="ghost"
                            className="text-emce-orange-deep"
                          >
                            Delete
                          </ConfirmSubmit>
                        </form>
                      </div>
                    </div>

                    {/* Inline edit — admin can clean up capitalisation,
                        set a missing city, change type. Common pattern:
                        candidate submits "vit chennai" with no city,
                        admin fixes "VIT Chennai" + adds Chennai +
                        confirms type → approve. Collapsed by default. */}
                    <details className="mt-4 border-t border-emce-border pt-3">
                      <summary className="cursor-pointer text-hint font-bold text-emce-dark hover:underline">
                        ✏️ Edit details before approving
                      </summary>
                      <form
                        action={adminEditInstitution}
                        className="mt-3 grid gap-3 sm:grid-cols-2"
                      >
                        <input type="hidden" name="institutionId" value={inst.id} />
                        <div className="sm:col-span-2">
                          <Label htmlFor={`edit-name-${inst.id}`}>Name *</Label>
                          <Input
                            id={`edit-name-${inst.id}`}
                            name="name"
                            defaultValue={inst.name}
                            required
                            maxLength={160}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-type-${inst.id}`}>Type *</Label>
                          <NativeSelect
                            id={`edit-type-${inst.id}`}
                            name="type"
                            defaultValue={inst.type}
                          >
                            {INSTITUTION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t
                                  .toLowerCase()
                                  .replace("_", " ")
                                  .replace(/^./, (c) => c.toUpperCase())}
                              </option>
                            ))}
                          </NativeSelect>
                        </div>
                        <div>
                          <Label htmlFor={`edit-city-${inst.id}`}>City</Label>
                          <Input
                            id={`edit-city-${inst.id}`}
                            name="city"
                            defaultValue={inst.city ?? ""}
                            maxLength={80}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-state-${inst.id}`}>State</Label>
                          <Input
                            id={`edit-state-${inst.id}`}
                            name="state"
                            defaultValue={inst.state ?? ""}
                            maxLength={80}
                          />
                        </div>
                        {/* Country reclassification (PR 7). The
                            existing `Institution.country` field
                            was String-defaulted to "IN" for every
                            seeded institution; multi-country
                            launches need admins to flip this for
                            non-Indian institutions (e.g. IIT-
                            Bombay's overseas campus, MIT, etc.).
                            Accepts ANY 2-letter ISO code (NOT
                            just the supported-country enum) so
                            admins can tag globally-mentioned
                            institutions without restricting to
                            our launch markets. */}
                        <div>
                          <Label htmlFor={`edit-country-${inst.id}`}>Country (ISO)</Label>
                          <Input
                            id={`edit-country-${inst.id}`}
                            name="country"
                            defaultValue={inst.country ?? "IN"}
                            placeholder="e.g. IN, GB, AE"
                            maxLength={2}
                            minLength={2}
                            required
                            pattern="[A-Za-z]{2}"
                            className="uppercase"
                          />
                        </div>
                        <div>
                          <Label htmlFor={`edit-website-${inst.id}`}>Website</Label>
                          <Input
                            id={`edit-website-${inst.id}`}
                            name="website"
                            type="url"
                            defaultValue={inst.website ?? ""}
                            placeholder="https://..."
                            maxLength={500}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`edit-domains-${inst.id}`}>Email domains</Label>
                          <Input
                            id={`edit-domains-${inst.id}`}
                            name="emailDomains"
                            defaultValue={inst.emailDomains.join(", ")}
                            placeholder="adypu.edu.in, ajeenkya.edu.in"
                            maxLength={600}
                          />
                          <p className="mt-1 text-hint text-emce-text-muted">
                            Comma-separated. A Recruitathon registrant whose signup email is on one of these is auto-linked to this college + its TPO cell.
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <Label htmlFor={`edit-aliases-${inst.id}`}>Aliases / abbreviations</Label>
                          <Input
                            id={`edit-aliases-${inst.id}`}
                            name="aliases"
                            defaultValue={inst.aliases.join(", ")}
                            placeholder="ADYPU, Ajeenkya DY Patil"
                            maxLength={600}
                          />
                          <p className="mt-1 text-hint text-emce-text-muted">
                            Comma-separated. Acronyms / common names students type instead of the full name. Exact (case-insensitive) matches auto-attribute; typos are caught by fuzzy search.
                          </p>
                        </div>
                        <div className="sm:col-span-2 flex justify-end">
                          <SubmitButton size="sm" variant="outline" pendingLabel="Saving…">
                            Save details
                          </SubmitButton>
                        </div>
                      </form>
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        {institutions.length === 200 && (
          <p className="text-hint text-emce-text-muted">
            Showing the first 200 — narrow the filter or use search to find more.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
