import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  publishPage,
  unpublishPage,
  archivePage,
  deletePage,
} from "@/server/admin/page-actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Pages — admin" };

/**
 * Admin index for the `Page` CMS. Filterable by status; supports
 * publish/unpublish/archive/delete inline. Editing the body lives
 * in a future /admin/pages/[id]/edit form once the rich editor
 * lands; for now the WordPress importer is the only write path.
 */
export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { status } = await searchParams;
  const filter =
    status === "PUBLISHED" || status === "ARCHIVED" || status === "DRAFT"
      ? status
      : null;

  const [counts, pages] = await Promise.all([
    db.page.groupBy({ by: ["status"], _count: { _all: true } }),
    db.page.findMany({
      where: filter ? { status: filter } : undefined,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 200,
      include: {
        importBatch: { select: { fileName: true, createdAt: true } },
      },
    }),
  ]);

  const draftCount = counts.find((c) => c.status === "DRAFT")?._count._all ?? 0;
  const publishedCount = counts.find((c) => c.status === "PUBLISHED")?._count._all ?? 0;
  const archivedCount = counts.find((c) => c.status === "ARCHIVED")?._count._all ?? 0;

  return (
    <AdminShell>
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Pages</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              CMS pages — surfaced publicly at <code>/&lt;slug&gt;</code> when published
              (via the same dispatcher as candidate handles).
              Imported from{" "}
              <Link href="/admin/import/content" className="font-bold text-emce-dark hover:underline">
                WordPress
              </Link>{" "}
              or future hand-authored.
            </p>
          </div>
        </header>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          <FilterChip href="/admin/pages" active={!filter} label="All" count={draftCount + publishedCount + archivedCount} />
          <FilterChip href="/admin/pages?status=DRAFT" active={filter === "DRAFT"} label="Draft" count={draftCount} />
          <FilterChip href="/admin/pages?status=PUBLISHED" active={filter === "PUBLISHED"} label="Published" count={publishedCount} />
          <FilterChip href="/admin/pages?status=ARCHIVED" active={filter === "ARCHIVED"} label="Archived" count={archivedCount} />
        </div>

        <Card className="p-0">
          {pages.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-emce-text">No pages here yet.</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Import some via{" "}
                <Link href="/admin/import/content" className="font-bold text-emce-dark hover:underline">
                  /admin/import/content
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-emce-border">
              {pages.map((p) => (
                <li key={p.id} className="px-4 py-3 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <Badge
                          variant={
                            p.status === "PUBLISHED"
                              ? "default"
                              : p.status === "ARCHIVED"
                                ? "outline"
                                : "outline"
                          }
                          size="sm"
                        >
                          {p.status}
                        </Badge>
                        <Link
                          href={`/${p.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="truncate font-bold text-emce-text hover:underline"
                        >
                          {p.title}
                        </Link>
                      </div>
                      <p className="mt-0.5 text-hint text-emce-text-sec">
                        <code>/{p.slug}</code>
                        {" · updated "}
                        {relativeTime(p.updatedAt)}
                        {p.importBatch && (
                          <> · from <code>{p.importBatch.fileName}</code></>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {p.status !== "PUBLISHED" && (
                        <form action={publishPage}>
                          <input type="hidden" name="pageId" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-emce-border bg-white px-2.5 py-1 text-xs font-bold text-emce-dark hover:bg-emce-light-soft"
                          >
                            Publish
                          </button>
                        </form>
                      )}
                      {p.status === "PUBLISHED" && (
                        <form action={unpublishPage}>
                          <input type="hidden" name="pageId" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-emce-border bg-white px-2.5 py-1 text-xs font-bold text-emce-text-sec hover:bg-emce-light-soft"
                          >
                            Unpublish
                          </button>
                        </form>
                      )}
                      {p.status !== "ARCHIVED" && (
                        <form action={archivePage}>
                          <input type="hidden" name="pageId" value={p.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-emce-border bg-white px-2.5 py-1 text-xs font-bold text-emce-text-sec hover:bg-emce-light-soft"
                          >
                            Archive
                          </button>
                        </form>
                      )}
                      <form action={deletePage}>
                        <input type="hidden" name="pageId" value={p.id} />
                        <ConfirmSubmit
                          confirm={`Delete "${p.title}" permanently? This cannot be undone.`}
                          variant="ghost"
                          size="sm"
                        >
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function FilterChip({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold transition ${
        active
          ? "border-emce-dark bg-emce-dark text-white"
          : "border-emce-border bg-white text-emce-text hover:border-emce-mid"
      }`}
    >
      {label}
      <span className={active ? "text-white/80" : "text-emce-text-sec"}>{count}</span>
    </Link>
  );
}
