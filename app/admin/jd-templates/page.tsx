import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminShell } from "@/components/layout/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { relativeTime } from "@/lib/utils";
import { JDStatus } from "@prisma/client";

export const metadata: Metadata = { title: "JD templates · Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
  { value: "ARCHIVED", label: "Archived" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * Admin list page for JD templates. Tabs by status, search box,
 * + per-row badges + edit-link. Create flow lives at
 * /admin/jd-templates/new; editing at /admin/jd-templates/[id].
 */
export default async function AdminJDTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Tab; q?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const tab: Tab =
    sp.status && TABS.some((t) => t.value === sp.status) ? sp.status : "PUBLISHED";
  const q = (sp.q ?? "").trim();

  const where = {
    status: tab,
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" as const } },
            { slug: { contains: q, mode: "insensitive" as const } },
            { keySkills: { has: q } },
          ],
        }
      : {}),
  };

  const [templates, counts] = await Promise.all([
    db.jobDescriptionTemplate.findMany({
      where,
      orderBy:
        tab === "DRAFT" ? { updatedAt: "desc" } : { publishedAt: "desc" },
      take: 200,
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        status: true,
        collarType: true,
        seniority: true,
        functionalArea: true,
        publishedAt: true,
        updatedAt: true,
        viewCount: true,
        evDomain: { select: { name: true } },
        author: { select: { name: true, email: true } },
      },
    }),
    db.jobDescriptionTemplate.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<
    Record<JDStatus, number>
  >;

  return (
    <AdminShell>
      <div className="container max-w-6xl py-8">
        <ToastFromSearchParams />
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">EV job description templates</h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              SEO + lead-gen role library surfaced at <code>/jd</code>. Every published row
              becomes its own indexable page; full content is gated behind sign-up.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/jd-templates/new">+ New JD template</Link>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/jd-templates?status=${t.value}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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

        <Card className="mt-4 p-3">
          <form className="flex flex-wrap items-center gap-2" action="/admin/jd-templates" method="get">
            <input type="hidden" name="status" value={tab} />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search title, slug or skill"
              className="flex-1 min-w-[220px]"
            />
            <Button type="submit" size="sm" variant="outline">Search</Button>
            {q && (
              <Link
                href={`/admin/jd-templates?status=${tab}`}
                className="text-hint font-bold text-emce-text-sec hover:text-emce-dark"
              >
                Clear
              </Link>
            )}
          </form>
        </Card>

        {templates.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="📋"
            title={`No ${tab.toLowerCase()} JD templates${q ? " matching your search" : ""}`}
            body={
              tab === "DRAFT"
                ? "Click '+ New JD template' to start one."
                : "Drafts are where you compose new templates before publishing."
            }
          />
        ) : (
          <ul className="mt-4 space-y-2">
            {templates.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/jd-templates/${t.id}`}>
                  <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-emce-text">{t.title}</span>
                      <StatusBadge status={t.status} />
                      <Badge variant="outline" className="text-[10px]">
                        {t.collarType}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {t.seniority}
                      </Badge>
                      {t.evDomain && (
                        <Badge variant="default" className="text-[10px]">
                          {t.evDomain.name}
                        </Badge>
                      )}
                      <span className="text-hint text-emce-text-muted">/jd/{t.slug}</span>
                    </div>
                    {t.summary && (
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">{t.summary}</p>
                    )}
                    <p className="mt-2 text-hint text-emce-text-muted">
                      {t.author ? `${t.author.name ?? t.author.email} · ` : ""}
                      {t.functionalArea}
                      {t.publishedAt && <> · published {relativeTime(t.publishedAt)}</>}
                      {t.status !== "PUBLISHED" && <> · last edited {relativeTime(t.updatedAt)}</>}
                      {t.viewCount > 0 && <> · {t.viewCount.toLocaleString()} views</>}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: JDStatus }) {
  if (status === "PUBLISHED") return <Badge variant="success" size="sm">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="outline" size="sm">Archived</Badge>;
  return <Badge variant="warning" size="sm">Draft</Badge>;
}
