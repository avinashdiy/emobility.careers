import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { setUserRole, setUserStatus, togglePlacementOfficer } from "@/server/admin/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Users" };

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  // 0-indexed page from the querystring, clamped to a non-negative
  // int. Bad input (e.g. ?page=foo, ?page=-3) falls through to 0
  // rather than throwing a 500.
  const pageRaw = Number.parseInt(sp.page ?? "0", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 0 ? pageRaw : 0;

  const where = {
    ...(sp.q && {
      OR: [
        { email: { contains: sp.q, mode: "insensitive" as const } },
        { name: { contains: sp.q, mode: "insensitive" as const } },
      ],
    }),
    ...(sp.role && { role: sp.role as "ADMIN" | "EMPLOYER" | "CANDIDATE" }),
    ...(sp.status && { status: sp.status as "ACTIVE" | "SUSPENDED" | "DELETED" }),
  };

  // Total count drives the pager + the "showing X of Y" caption.
  // Both queries run in parallel — count is cheap on the indexed
  // columns we filter by.
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
    }),
    db.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  // Build a stable querystring for pager links — preserves the
  // active filter set so prev/next don't reset the user's filters.
  const baseParams = new URLSearchParams({
    ...(sp.q ? { q: sp.q } : {}),
    ...(sp.role ? { role: sp.role } : {}),
    ...(sp.status ? { status: sp.status } : {}),
  });
  const pagerHref = (p: number) => {
    const qs = new URLSearchParams(baseParams);
    if (p > 0) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/admin/users?${s}` : "/admin/users";
  };

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <ToastFromSearchParams />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">Users</h1>
            <p className="mt-1 text-hint text-emce-text-sec">
              {total.toLocaleString()} user{total === 1 ? "" : "s"} matching filters
              {totalPages > 1 && (
                <>
                  {" "}· page {page + 1} of {totalPages.toLocaleString()}
                </>
              )}
            </p>
          </div>
          {/* CSV export honours the active filters — querystring is
              forwarded so admins download exactly what they see. Capped
              at 10k rows server-side. Pagination is NOT forwarded —
              admins exporting "the current view" almost always mean
              the full filtered set, not just page N. */}
          <Button asChild variant="outline" size="sm">
            <a
              href={`/api/admin/users/export?${new URLSearchParams({
                ...(sp.q ? { q: sp.q } : {}),
                ...(sp.role ? { role: sp.role } : {}),
                ...(sp.status ? { status: sp.status } : {}),
              }).toString()}`}
              download
              aria-label="Download users CSV"
            >
              Export CSV
            </a>
          </Button>
        </div>

        <Card className="mt-4 p-4">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-6"><Input name="q" defaultValue={sp.q ?? ""} placeholder="Search by name or email" /></div>
            <div className="sm:col-span-2">
              <NativeSelect name="role" defaultValue={sp.role ?? ""}>
                <option value="">Any role</option>
                <option value="CANDIDATE">Candidate</option>
                <option value="EMPLOYER">Employer</option>
                <option value="ADMIN">Admin</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="status" defaultValue={sp.status ?? ""}>
                <option value="">Any status</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="DELETED">Deleted</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2"><Button type="submit" className="w-full">Filter</Button></div>
          </form>
        </Card>

        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">Email / Name</th>
                <th scope="col" className="p-3">Role</th>
                <th scope="col" className="p-3">Status</th>
                <th scope="col" className="p-3">Joined</th>
                <th scope="col" className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="p-3">
                    <a href={`/admin/users/${u.id}`} className="block hover:underline">
                      <div className="font-bold text-emce-text">{u.name ?? "—"}</div>
                      <div className="text-hint text-emce-text-sec">{u.email}</div>
                    </a>
                  </td>
                  <td className="p-3"><Badge variant="default">{u.role}</Badge></td>
                  <td className="p-3"><Badge variant={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
                  <td className="p-3 text-hint text-emce-text-muted">{relativeTime(u.createdAt)}</td>
                  <td className="p-3 space-x-2">
                    <form action={setUserRole} className="inline-flex items-center gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <NativeSelect name="role" defaultValue={u.role} className="w-28">
                        <option value="CANDIDATE">CANDIDATE</option>
                        <option value="EMPLOYER">EMPLOYER</option>
                        <option value="ADMIN">ADMIN</option>
                      </NativeSelect>
                      <Button type="submit" size="sm" variant="ghost">Set role</Button>
                    </form>
                    <form action={setUserStatus} className="inline-flex">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="status" value={u.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"} />
                      {u.status === "ACTIVE" ? (
                        <ConfirmSubmit
                          confirm={`Suspend ${u.email}? They won't be able to sign in.`}
                          size="sm"
                          variant="destructive"
                        >
                          Suspend
                        </ConfirmSubmit>
                      ) : (
                        <Button type="submit" size="sm">Activate</Button>
                      )}
                    </form>
                    {/* Placement-officer toggle. Granting `isPlacementOfficer`
                        unlocks /tpo for the user without escalating their
                        role — used for trusted DIYguru staff who shouldn't
                        see the rest of /admin. */}
                    <form action={togglePlacementOfficer} className="inline-flex">
                      <input type="hidden" name="userId" value={u.id} />
                      {u.isPlacementOfficer ? (
                        <Button type="submit" size="sm" variant="ghost" title="Revoke /tpo access">
                          ✓ TPO · revoke
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="outline" title="Grant /tpo access">
                          Grant TPO
                        </Button>
                      )}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Pager — only renders when there's more than one page.
            We keep both ends ("First" / "Last") for navigating large
            result sets quickly; the row-counter ("X-Y of Z") gives
            admins an anchor so they don't lose their place when
            stepping through. */}
        {totalPages > 1 && (
          <nav
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
            aria-label="User list pagination"
          >
            <p className="text-hint text-emce-text-sec">
              Showing {(page * PAGE_SIZE + 1).toLocaleString()}–
              {Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              {hasPrev ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <Link href={pagerHref(0)} aria-label="First page">« First</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={pagerHref(page - 1)} aria-label="Previous page">← Prev</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled>« First</Button>
                  <Button size="sm" variant="outline" disabled>← Prev</Button>
                </>
              )}
              <span className="text-hint font-bold text-emce-text">
                {page + 1} / {totalPages}
              </span>
              {hasNext ? (
                <>
                  <Button asChild size="sm" variant="outline">
                    <Link href={pagerHref(page + 1)} aria-label="Next page">Next →</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={pagerHref(totalPages - 1)} aria-label="Last page">Last »</Link>
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" disabled>Next →</Button>
                  <Button size="sm" variant="outline" disabled>Last »</Button>
                </>
              )}
            </div>
          </nav>
        )}
      </div>
    </AdminShell>
  );
}
