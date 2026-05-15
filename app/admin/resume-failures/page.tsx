import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { resumeParseQueue } from "@/lib/queues";
import {
  retryFailedJob,
  retryAllFailed,
} from "@/server/admin/operations-actions";
import type { Job } from "bullmq";

export const metadata = { title: "Resume parse failures" };
export const dynamic = "force-dynamic";

interface FailureRow {
  id: string;
  attempts: number;
  failedReason: string | null;
  timestamp: number;
  candidateId: string | null;
  bucket: string | null;
  key: string | null;
  candidate?: {
    slug: string;
    firstName: string;
    lastName: string | null;
    user: { email: string };
  } | null;
}

export default async function ResumeFailuresPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const failed = await resumeParseQueue
    .getJobs(["failed"], 0, 199, false)
    .catch(() => [] as Job[]);

  // Hydrate with candidate profile so admins can spot patterns ("all
  // failures are from PDFs uploaded over 50MB" or "all are accounts
  // missing email verification").
  const candidateIds = Array.from(
    new Set(
      failed
        .map((j) => (j.data as { candidateId?: string })?.candidateId)
        .filter(Boolean) as string[],
    ),
  );
  const candidates =
    candidateIds.length > 0
      ? await db.candidateProfile.findMany({
          where: { id: { in: candidateIds } },
          select: {
            id: true,
            slug: true,
            firstName: true,
            lastName: true,
            user: { select: { email: true } },
          },
        })
      : [];
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const rows: FailureRow[] = failed.map((j) => {
    const data = (j.data ?? {}) as {
      candidateId?: string;
      bucket?: string;
      key?: string;
    };
    return {
      id: j.id ?? "",
      attempts: j.attemptsMade,
      failedReason: j.failedReason ?? null,
      timestamp: j.timestamp,
      candidateId: data.candidateId ?? null,
      bucket: data.bucket ?? null,
      key: data.key ?? null,
      candidate: data.candidateId
        ? candidateById.get(data.candidateId) ?? null
        : null,
    };
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">Resume parse failures</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Jobs that exhausted retries on the resume-parse queue. Each row
              shows the candidate context so you can spot patterns. Bulk-retry
              after a provider outage; Discard for permanent failures (corrupt
              PDFs, deleted candidates).
            </p>
          </div>
          {rows.length > 0 && (
            <form action={retryAllFailed}>
              <input type="hidden" name="queue" value="resume-parse" />
              <ConfirmSubmit
                confirm={`Retry all ${rows.length} failed parses?`}
                size="sm"
              >
                Retry all ({rows.length})
              </ConfirmSubmit>
            </form>
          )}
        </div>

        {rows.length === 0 ? (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl" aria-hidden>✓</div>
            <p className="mt-3 text-section text-emce-text">No resume-parse failures.</p>
          </Card>
        ) : (
          <ul className="mt-6 space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {r.candidate ? (
                          <>
                            <Link
                              href={`/${r.candidate.slug}`}
                              className="font-bold text-emce-text hover:underline"
                            >
                              {r.candidate.firstName} {r.candidate.lastName ?? ""}
                            </Link>
                            <span className="text-hint text-emce-text-muted">
                              {r.candidate.user.email}
                            </span>
                          </>
                        ) : (
                          <span className="font-bold text-emce-text-muted">
                            [candidate deleted]
                          </span>
                        )}
                        <Badge variant="warning">{r.attempts} attempts</Badge>
                        <span className="text-hint text-emce-text-muted">
                          {new Date(r.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {r.failedReason && (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-emce-red-light p-2 text-xs text-emce-red-deep">
                          {r.failedReason}
                        </pre>
                      )}
                      {r.bucket && r.key && (
                        <p className="mt-2 text-hint text-emce-text-muted">
                          File: <code>{r.bucket}/{r.key}</code>
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 sm:w-32">
                      <form action={retryFailedJob}>
                        <input type="hidden" name="queue" value="resume-parse" />
                        <input type="hidden" name="jobId" value={r.id} />
                        <Button type="submit" size="sm" className="w-full">Retry</Button>
                      </form>
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/operations/resume-parse`}>
                          Queue page
                        </Link>
                      </Button>
                    </div>
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
