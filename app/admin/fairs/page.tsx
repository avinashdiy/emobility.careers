import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "@/components/layout/admin-shell";
import { CreateFairForm } from "@/components/recruitment-drives/CreateFairForm";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Recruitment drives" };
export const dynamic = "force-dynamic";

export default async function AdminFairsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const drives = await db.recruitmentDrive.findMany({
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      city: true,
      status: true,
      startsAt: true,
      endsAt: true,
      participatingCount: true,
      jobsCount: true,
      applicationsCount: true,
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-6 md:py-8">
        <div>
          <h1 className="text-dashboard text-emce-text">Recruitment drives</h1>
          <p className="mt-1 text-hint text-emce-text-sec">
            Create and run multi-company job fairs. Each drive lives at
            /fairs/[slug] once published.
          </p>
        </div>

        <CreateFairForm />

        <div>
          <h2 className="text-section text-emce-text">All drives</h2>
          {drives.length === 0 ? (
            <EmptyState
              icon="🪪"
              title="No drives yet"
              body="Create your first fair using the form above."
            />
          ) : (
            <ul className="mt-3 space-y-2">
              {drives.map((d) => (
                <li key={d.id}>
                  <Link href={`/admin/fairs/${d.id}`} className="block">
                    <Card className="p-4 hover:border-emce-mid hover:shadow-emce-hover">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="font-bold text-emce-text">{d.title}</span>
                            <StatusBadge status={d.status} />
                          </div>
                          <p className="text-hint text-emce-text-sec">
                            📍 {d.city} ·{" "}
                            {d.startsAt.toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}{" "}
                            · {d.participatingCount} companies · {d.jobsCount} roles
                            {d.applicationsCount > 0 && (
                              <> · {d.applicationsCount} applications</>
                            )}
                          </p>
                        </div>
                        <span className="text-hint text-emce-dark">Manage →</span>
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "default" | "success" | "warning" | "danger" | "outline"; label: string }> = {
    DRAFT: { tone: "outline", label: "Draft" },
    OPEN: { tone: "default", label: "Open" },
    IN_PROGRESS: { tone: "success", label: "Live now" },
    CLOSED: { tone: "outline", label: "Closed" },
    CANCELLED: { tone: "danger", label: "Cancelled" },
  };
  const s = map[status] ?? { tone: "default" as const, label: status };
  return <Badge variant={s.tone} size="sm">{s.label}</Badge>;
}
