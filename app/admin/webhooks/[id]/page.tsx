import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_TONE = {
  PENDING: "warning",
  DELIVERED: "success",
  FAILED: "danger",
  INVALID: "danger",
} as const;

export default async function WebhookDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const event = await db.webhookEvent.findUnique({
    where: { id },
    include: { company: { select: { name: true, slug: true } } },
  });
  if (!event) notFound();

  return (
    <AdminShell>
      <div className="container max-w-4xl py-10">
        <Link
          href="/admin/webhooks"
          className="inline-flex items-center gap-1 text-hint font-bold text-emce-dark hover:underline"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> All webhooks
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-section text-emce-text">{event.topic}</h1>
          <Badge variant="outline">{event.direction}</Badge>
          <Badge variant={STATUS_TONE[event.status]}>{event.status}</Badge>
          {event.httpStatus && (
            <Badge variant={event.httpStatus < 300 ? "success" : "danger"}>
              HTTP {event.httpStatus}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-emce-text-sec">
          Source: <code>{event.source}</code>
          {event.externalId && (
            <>
              {" · "}External id: <code>{event.externalId}</code>
            </>
          )}
        </p>
        {event.url && (
          <p className="mt-1 break-all font-mono text-hint text-emce-text-muted">
            {event.url}
          </p>
        )}
        {event.company && (
          <p className="mt-1 text-hint text-emce-text-sec">
            Company:{" "}
            <Link
              href={`/admin/employers`}
              className="font-bold text-emce-dark hover:underline"
            >
              {event.company.name}
            </Link>
          </p>
        )}
        <p className="mt-1 text-hint text-emce-text-muted">
          Received {event.receivedAt.toLocaleString()}
          {event.deliveredAt && ` · Delivered ${event.deliveredAt.toLocaleString()}`}
          {event.attempts > 1 && ` · ${event.attempts} attempts`}
        </p>

        {event.responseBody && (
          <Card className="mt-4 p-3">
            <h2 className="text-section text-emce-text">Response</h2>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-emce-light-soft p-3 text-xs">
              {event.responseBody}
            </pre>
          </Card>
        )}
        {event.payload !== null && event.payload !== undefined && (
          <Card className="mt-4 p-3">
            <h2 className="text-section text-emce-text">Payload</h2>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-emce-light-soft p-3 text-xs">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
