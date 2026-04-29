import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { dismissReport, actionReport } from "@/server/moderation/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Job reports" };

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam / duplicate",
  MISLEADING: "Misleading",
  FRAUDULENT: "Fraudulent",
  INAPPROPRIATE: "Inappropriate",
  EXPIRED: "Expired",
  OTHER: "Other",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const status = sp.status ?? "OPEN";

  const reports = await db.jobReport.findMany({
    where: { status: status as "OPEN" | "REVIEWED" | "DISMISSED" | "ACTIONED" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      job: { select: { id: true, title: true, status: true, company: { select: { name: true } } } },
    },
  });

  const counts = await db.jobReport.groupBy({
    by: ["status"],
    _count: true,
  });
  const countMap = Object.fromEntries(counts.map((c) => [c.status, c._count]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Job reports</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Public reports on job listings. Jobs with 3+ open reports are auto-paused for review.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {["OPEN", "ACTIONED", "DISMISSED", "REVIEWED"].map((s) => (
            <Link
              key={s}
              href={`/admin/reports?status=${s}`}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                status === s ? "bg-emce-dark text-emce-light" : "bg-white text-emce-text-sec hover:bg-emce-light-soft"
              }`}
            >
              {s} ({countMap[s] ?? 0})
            </Link>
          ))}
        </div>

        {reports.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">✓</div>
            <p className="mt-3 text-section text-emce-text">No reports in {status.toLowerCase()}</p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="danger">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
                        <Link href={`/jobs/${r.job.id}`} className="font-bold text-emce-text hover:underline">
                          {r.job.title}
                        </Link>
                        <span className="text-hint text-emce-text-muted">· {r.job.company.name}</span>
                        <Badge variant="outline">{r.job.status}</Badge>
                      </div>
                      {r.details && (
                        <p className="mt-2 whitespace-pre-line rounded-md bg-emce-light-soft p-2 text-body text-emce-text-sec">
                          {r.details}
                        </p>
                      )}
                      <p className="mt-1 text-hint text-emce-text-muted">
                        {relativeTime(r.createdAt)}
                        {r.reporterUserId ? " · by signed-in user" : " · anonymous"}
                        {r.ip ? ` · ${r.ip}` : ""}
                      </p>
                      {r.reviewerNotes && (
                        <p className="mt-2 text-hint text-emce-text-sec">
                          <strong>Reviewer:</strong> {r.reviewerNotes}
                        </p>
                      )}
                    </div>
                    {r.status === "OPEN" && (
                      <div className="flex flex-col gap-2 sm:w-64">
                        <form action={dismissReport} className="space-y-2">
                          <input type="hidden" name="id" value={r.id} />
                          <Textarea name="notes" rows={2} placeholder="Reviewer notes (optional)" />
                          <Button type="submit" size="sm" variant="ghost" className="w-full">
                            Dismiss as not actionable
                          </Button>
                        </form>
                        <form action={actionReport} className="space-y-2">
                          <input type="hidden" name="id" value={r.id} />
                          <Textarea name="notes" rows={2} placeholder="Reviewer notes" />
                          <input type="hidden" name="action" value="pause-job" />
                          <ConfirmSubmit
                            confirm={`Pause "${r.job.title}"? You can re-open it later.`}
                            size="sm"
                            variant="default"
                            className="w-full"
                          >
                            Pause this job
                          </ConfirmSubmit>
                        </form>
                        <form action={actionReport}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="action" value="close-job" />
                          <ConfirmSubmit
                            confirm={`Close "${r.job.title}" permanently?`}
                            size="sm"
                            variant="destructive"
                            className="w-full"
                          >
                            Close job
                          </ConfirmSubmit>
                        </form>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
