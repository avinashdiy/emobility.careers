import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { AdminShell } from "@/components/layout/admin-shell";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; page?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const page = sp.page ? parseInt(sp.page) : 1;
  const pageSize = 50;

  const entries = await db.auditLog.findMany({
    where: {
      ...(sp.q && {
        OR: [
          { action: { contains: sp.q, mode: "insensitive" } },
          { entity: { contains: sp.q, mode: "insensitive" } },
          { entityId: { contains: sp.q } },
        ],
      }),
      ...(sp.entity && { entity: sp.entity }),
    },
    orderBy: { createdAt: "desc" },
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <AdminShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Audit log</h1>
        <p className="mt-1 text-sm text-emce-text-sec">All admin and authorization-relevant actions.</p>

        <Card className="mt-4 p-4">
          <form className="flex gap-3">
            <Input name="q" defaultValue={sp.q ?? ""} placeholder="Search action or entity ID" className="flex-1" />
            <Input name="entity" defaultValue={sp.entity ?? ""} placeholder="Entity (e.g. User)" className="w-40" />
            <Button type="submit">Filter</Button>
          </form>
        </Card>

        <Card className="mt-4 overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th scope="col" className="p-3">When</th>
                <th scope="col" className="p-3">Actor</th>
                <th scope="col" className="p-3">Action</th>
                <th scope="col" className="p-3">Entity</th>
                <th scope="col" className="p-3">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-emce-text-muted">No entries.</td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3 text-hint text-emce-text-muted">{relativeTime(e.createdAt)}</td>
                    <td className="p-3">{e.actor?.name ?? e.actor?.email ?? <em>system</em>}</td>
                    <td className="p-3"><Badge variant="default">{e.action}</Badge></td>
                    <td className="p-3 text-hint text-emce-text-sec">
                      {e.entity}{e.entityId && <span className="text-emce-text-muted"> · {e.entityId.slice(0, 8)}</span>}
                    </td>
                    <td className="p-3 text-hint text-emce-text-muted">
                      <pre className="max-w-xs overflow-x-auto">{e.meta ? JSON.stringify(e.meta) : "—"}</pre>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>

        <div className="mt-4 flex justify-center gap-2">
          {page > 1 && (
            <Button asChild variant="outline" size="sm"><Link href={`/admin/audit?page=${page - 1}`}>← Prev</Link></Button>
          )}
          <span className="text-sm text-emce-text-sec self-center">Page {page}</span>
          {entries.length === pageSize && (
            <Button asChild variant="outline" size="sm"><Link href={`/admin/audit?page=${page + 1}`}>Next →</Link></Button>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
