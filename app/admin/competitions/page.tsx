import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { getModerationQueue } from "@/server/competitions/queries";
import { AdminReviewActions } from "@/components/competitions/AdminReviewActions";

export const metadata = { title: "Competition moderation" };

export default async function AdminCompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "PENDING_REVIEW" | "CHANGES_REQUESTED" | "REJECTED" | "ALL" }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const status = sp.status ?? "PENDING_REVIEW";
  const queue = await getModerationQueue(status);
  const tabs: typeof status[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "REJECTED", "ALL"];

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-dashboard text-emce-text md:text-3xl">Competition moderation</h1>
          <nav className="flex gap-1 rounded-md border border-emce-border p-1">
            {tabs.map((t) => (
              <Link
                key={t}
                href={`/admin/competitions?status=${t}`}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${t === status ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
              >{t.replace("_", " ")}</Link>
            ))}
          </nav>
        </div>

        <div className="space-y-3">
          {queue.length === 0 && <Card className="p-6 text-center text-sm text-emce-text-sec">Queue is empty.</Card>}
          {queue.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/competitions/${c.slug}`} className="font-bold text-emce-text hover:underline">{c.title}</Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant="warning" className="text-[10px]">{c.status}</Badge>
                    <span className="text-xs text-emce-text-sec">{c.hostCompany.name}</span>
                  </div>
                  {c.tagline && <p className="mt-1 line-clamp-2 text-sm text-emce-text-sec">{c.tagline}</p>}
                  <div className="mt-1 text-hint text-emce-text-sec">
                    Submitted: {c.submittedAt?.toLocaleString("en-IN") ?? "—"} · {c._count.registrations} pre-registrations
                  </div>
                  <div className="mt-1 flex gap-3 text-xs">
                    <Link href={`/admin/competitions/${c.id}/prizes`} className="font-bold text-emce-dark hover:underline">Manage prizes →</Link>
                  </div>
                </div>
                {c.status === "PENDING_REVIEW" && <AdminReviewActions competitionId={c.id} />}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
