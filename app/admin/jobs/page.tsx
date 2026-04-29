import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { setJobStatus } from "@/server/admin/actions";

export const metadata = { title: "Job moderation" };

export default async function AdminJobsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const jobs = await db.jobPosting.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { company: true },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Job moderation</h1>
        <ul className="mt-6 space-y-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/jobs/${j.id}`} className="font-bold text-emce-text hover:underline">
                      {j.title}
                    </Link>
                    <p className="text-hint text-emce-text-sec">
                      {j.company.name} · {j.workMode} · {j.profileMode}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={j.status === "OPEN" ? "success" : "outline"}>{j.status}</Badge>
                    <form action={setJobStatus}>
                      <input type="hidden" name="id" value={j.id} />
                      <input type="hidden" name="status" value={j.status === "OPEN" ? "PAUSED" : "OPEN"} />
                      <Button type="submit" size="sm">{j.status === "OPEN" ? "Pause" : "Open"}</Button>
                    </form>
                    <form action={setJobStatus}>
                      <input type="hidden" name="id" value={j.id} />
                      <input type="hidden" name="status" value="CLOSED" />
                      <ConfirmSubmit
                        confirm={`Close "${j.title}"? Candidates can no longer apply.`}
                        size="sm"
                        variant="destructive"
                      >
                        Close
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </AdminShell>
  );
}
