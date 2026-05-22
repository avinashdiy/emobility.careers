import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { PageHeader } from "@/components/ui/page-header";
import { adminSetCompanyCountry } from "@/server/admin/actions";
import {
  SUPPORTED_COUNTRY_LIST,
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
} from "@/lib/countries";
import type { Country, Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Company country reclassification · Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin tool for re-tagging Company.hqCountry. Why it exists:
 *
 *   Every company seeded before PR 1 backfilled to IN. The
 *   default is correct for the ~528 DIYguru-curated EV companies
 *   today (all Indian), but as anchor employers from new markets
 *   onboard (Tata-owned JLR HQ in Coventry → UK; Lucid in
 *   California → US; Bee'ah in Sharjah → AE) the admin needs a
 *   surface to flip them to the correct country.
 *
 *   Without this:
 *     • JLR shows up only on /companies (and not /uk/companies)
 *     • The /uk landing page's "EV employers" rail is empty
 *     • The Google for Jobs / GSC country attribution for the
 *       UK company surface stays underweight
 *
 * Scope of this page (deliberately narrow):
 *   • List every VERIFIED company (+ search by name/slug).
 *   • Country chip + per-row inline dropdown to change it.
 *   • Country filter chip in the toolbar so admin can do "show
 *     me every company we still have flagged IN and verify"
 *     as a sweep.
 *
 * Not in scope (covered by other admin surfaces):
 *   • Company verification status — /admin/employers
 *   • Auto-fetched data review — /admin/companies/enrichment-queue
 *   • Job-level country (independent dimension) — recruiter
 *     edits per-job in /employer/jobs/[id]/edit
 */
export default async function AdminCompanyCountryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const paramCountry = sp.country?.toUpperCase();
  const filterCountry: Country | undefined = isSupportedCountry(paramCountry)
    ? (paramCountry as Country)
    : undefined;

  // Per-country counts feed the chip badges so the admin sees
  // "8 still tagged IN, 0 GB, 0 AE..." at a glance and knows
  // which sweep to do next.
  const groupCounts = await db.company.groupBy({
    by: ["hqCountry"],
    where: { verificationStatus: "VERIFIED" },
    _count: { _all: true },
  });
  const byCountry = new Map(groupCounts.map((g) => [g.hqCountry, g._count._all]));

  const where: Prisma.CompanyWhereInput = {
    verificationStatus: "VERIFIED",
    ...(filterCountry ? { hqCountry: filterCountry } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const companies = await db.company.findMany({
    where,
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      hqLocation: true,
      hqCountry: true,
      operatesInCountries: true,
      website: true,
    },
    orderBy: [{ hqCountry: "asc" }, { name: "asc" }],
    take: 200,
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-8 md:py-10">
        <ToastFromSearchParams />
        <PageHeader
          eyebrow="Admin · Companies"
          title="Country reclassification"
          subtitle="Move companies into the right hqCountry — drives per-country sitemaps, /[cc]/companies routes, and GSC country attribution. Defaults to IN for legacy rows; flip anchor employers (JLR → UK, Tesla → US, Bee'ah → AE) as needed."
        />

        <div className="mt-4 flex justify-end">
          <Link
            href="/admin/companies/bulk"
            className="inline-flex h-9 items-center rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-dark hover:border-emce-mid hover:bg-emce-light-soft"
          >
            📥 Bulk CSV import →
          </Link>
        </div>

        {/* ── Toolbar: search + country filter chips ── */}
        <Card className="mt-6 p-4">
          <form className="flex flex-wrap items-end gap-3" method="GET">
            <div className="min-w-[200px] flex-1">
              <label
                htmlFor="q"
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emce-text-muted"
              >
                Search
              </label>
              <Input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Company name or slug"
              />
            </div>
            <div className="min-w-[180px]">
              <label
                htmlFor="country-filter"
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emce-text-muted"
              >
                Current country
              </label>
              <NativeSelect
                id="country-filter"
                name="country"
                defaultValue={filterCountry ?? ""}
              >
                <option value="">🌍 All</option>
                {SUPPORTED_COUNTRY_LIST.map((c) => {
                  const n = byCountry.get(c.code) ?? 0;
                  return (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name} ({n})
                    </option>
                  );
                })}
              </NativeSelect>
            </div>
            <Button type="submit" size="sm">
              Apply
            </Button>
            {(filterCountry || q) && (
              <Button asChild size="sm" variant="ghost">
                <Link href="/admin/companies">Clear</Link>
              </Button>
            )}
          </form>

          {/* Per-country count chips (one-click filter) — same
              numbers as the dropdown but visually scannable. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUPPORTED_COUNTRY_LIST.map((c) => {
              const n = byCountry.get(c.code) ?? 0;
              const isActive = filterCountry === c.code;
              return (
                <Link
                  key={c.code}
                  href={`/admin/companies?country=${c.code}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    isActive
                      ? "border-emce-dark bg-emce-dark text-white"
                      : "border-emce-border bg-white text-emce-text hover:border-emce-mid hover:bg-emce-light-soft"
                  }`}
                >
                  <span aria-hidden>{c.flag}</span>
                  <span>{c.name}</span>
                  <span className={isActive ? "text-white/80" : "text-emce-text-muted"}>
                    {n}
                  </span>
                </Link>
              );
            })}
          </div>
        </Card>

        {/* ── Company list ── */}
        <p className="mt-6 text-hint text-emce-text-sec">
          Showing {companies.length} of {companies.length === 200 ? "200+" : companies.length}{" "}
          company{companies.length === 1 ? "" : "ies"}
          {filterCountry && (
            <> in {SUPPORTED_COUNTRIES[filterCountry].name}</>
          )}
          .
        </p>

        <ul className="mt-3 space-y-2">
          {companies.map((c) => (
            <li key={c.id}>
              <Card className="p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-10 w-10 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-sm font-extrabold text-emce-dark">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" />
                    ) : (
                      c.name[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/company/${c.slug}`}
                      target="_blank"
                      className="font-bold text-emce-text hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-hint text-emce-text-muted">
                      <Badge variant="outline" size="sm" className="mr-1.5">
                        {SUPPORTED_COUNTRIES[c.hqCountry].flag}{" "}
                        {SUPPORTED_COUNTRIES[c.hqCountry].name}
                      </Badge>
                      {/* Additional-operations chips (PR 8). Visible
                          when the company has been flipped multi-
                          region. The HQ is implicit and not repeated
                          in the array so chips show ONLY the extras. */}
                      {c.operatesInCountries.map((cc) => (
                        <Badge
                          key={cc}
                          variant="outline"
                          size="sm"
                          className="mr-1 border-emce-dark/30 text-emce-dark"
                          title="Also operates here"
                        >
                          + {SUPPORTED_COUNTRIES[cc].flag}{" "}
                          {SUPPORTED_COUNTRIES[cc].name}
                        </Badge>
                      ))}
                      {c.hqLocation || "—"}
                      {c.website && (
                        <>
                          {" · "}
                          <a
                            href={c.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            site
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  {/* Inline reclassification form. Submitting with
                      the same values is a no-op (handled in the
                      server action). Per-row form keeps the page
                      stateless — no client JS needed.

                      Two dimensions:
                        • HQ country dropdown — primary market
                        • OperatesIn input — comma-separated extra
                          markets (PR 8). JLR's row would carry
                          hqCountry=GB + operatesIn="IN" so it
                          surfaces on both /uk/companies AND
                          /in/companies. */}
                  <form
                    action={adminSetCompanyCountry}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="companyId" value={c.id} />
                    <NativeSelect
                      name="country"
                      defaultValue={c.hqCountry}
                      className="h-9 text-xs"
                      title="HQ country"
                    >
                      {SUPPORTED_COUNTRY_LIST.map((meta) => (
                        <option key={meta.code} value={meta.code}>
                          {meta.flag} {meta.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <input
                      type="text"
                      name="operatesInRaw"
                      defaultValue={c.operatesInCountries.join(",")}
                      placeholder="+ IN,AE"
                      title="Additional countries this company operates in (comma-separated ISO codes — e.g. IN,AE)"
                      maxLength={120}
                      className="h-9 w-32 rounded-md border border-emce-border bg-white px-2 text-xs uppercase focus:border-emce-mid focus:outline-none"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        {companies.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <p className="text-section text-emce-text">No companies match.</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Try clearing filters or searching by name.
            </p>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
