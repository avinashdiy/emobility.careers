import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ContactShareActions } from "@/components/profile/ContactShareActions";
import { PageHeader } from "@/components/ui/page-header";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Contact shares" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "default" | "warning" | "success" | "danger" | "outline"> = {
  PENDING: "warning",
  GRANTED: "success",
  DENIED: "danger",
  REVOKED: "outline",
  EXPIRED: "outline",
};

export default async function ContactSharesInbox() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/contact-shares");

  // Inbox view from the candidate's perspective. Pending requests at
  // the top so they can act; granted shares next so they can audit;
  // historical (denied/revoked/expired) at the bottom for context.
  const all = await db.contactShareRequest.findMany({
    where: { targetUserId: session.user.id },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 100,
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          employerProfile: {
            select: {
              designation: true,
              company: { select: { id: true, name: true, slug: true, logoUrl: true } },
            },
          },
        },
      },
      application: {
        select: {
          id: true,
          job: { select: { id: true, slug: true, title: true } },
        },
      },
    },
  });

  const pending = all.filter((r) => r.status === "PENDING");
  const granted = all.filter((r) => r.status === "GRANTED");
  const history = all.filter(
    (r) =>
      r.status === "DENIED" || r.status === "REVOKED" || r.status === "EXPIRED",
  );

  return (
    <div className="container max-w-3xl py-10">
      <PageHeader
        title="Contact shares"
        subtitle="Recruiters who've asked to see your email and phone. Approve to share with that recruiter only — not their company, not the platform, just them. You can revoke any time."
      />

      {/* Pending — call to action */}
      {pending.length > 0 && (
        <section className="mt-6">
          <h2 className="text-section text-emce-text">Awaiting your response</h2>
          <ul className="emce-stagger mt-3 space-y-3">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="border-emce-orange/40 bg-emce-orange-light/30 p-4">
                  <RequestRow row={r} />
                  <div className="mt-3">
                    <ContactShareActions
                      requestId={r.id}
                      status={r.status as "PENDING"}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active grants */}
      <section className="mt-8">
        <h2 className="text-section text-emce-text">Active access</h2>
        {granted.length === 0 ? (
          <p className="mt-2 text-hint text-emce-text-sec">
            Nobody currently has access to your contact via this flow.
          </p>
        ) : (
          <ul className="emce-stagger mt-3 space-y-3">
            {granted.map((r) => (
              <li key={r.id}>
                <Card className="border-emce-mid/40 p-4">
                  <RequestRow row={r} />
                  <div className="mt-2 text-hint text-emce-text-sec">
                    Granted {r.grantedAt ? relativeTime(r.grantedAt) : ""}
                  </div>
                  <div className="mt-3">
                    <ContactShareActions
                      requestId={r.id}
                      status={r.status as "GRANTED"}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historical */}
      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-section text-emce-text">History</h2>
          <ul className="emce-stagger mt-3 space-y-2">
            {history.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-border p-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-emce-text">
                      {recruiterDisplay(r.requester)}
                    </span>
                    <Badge variant={STATUS_TONE[r.status] ?? "outline"}>
                      {r.status}
                    </Badge>
                    <span className="text-hint text-emce-text-muted">
                      {relativeTime(r.updatedAt)}
                    </span>
                  </div>
                  {r.denyReason && r.status === "DENIED" && (
                    <p className="mt-1 text-hint text-emce-text-muted">
                      Your reason: {r.denyReason}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length === 0 && granted.length === 0 && history.length === 0 && (
        <Card className="mt-6 p-10 text-center">
          <div className="text-4xl" aria-hidden>📬</div>
          <p className="mt-3 text-section text-emce-text">No contact requests yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">
            When a recruiter asks to see your email and phone, the request lands
            here. Until then, your contact stays private.
          </p>
        </Card>
      )}
    </div>
  );
}

type RequesterShape = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  employerProfile: {
    designation: string | null;
    company: { id: string; name: string; slug: string; logoUrl: string | null };
  } | null;
};

function recruiterDisplay(r: RequesterShape): string {
  return r.name ?? r.email;
}

function RequestRow({
  row,
}: {
  row: {
    id: string;
    message: string | null;
    createdAt: Date;
    requester: RequesterShape;
    application: {
      id: string;
      job: { id: string; slug: string; title: string };
    } | null;
  };
}) {
  const r = row.requester;
  const company = r.employerProfile?.company;
  const designation = r.employerProfile?.designation;
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Avatar src={r.image} name={recruiterDisplay(r)} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-bold text-emce-text">{recruiterDisplay(r)}</span>
          {company && (
            <Link
              href={`/company/${company.slug}`}
              className="text-hint text-emce-text-sec hover:underline"
            >
              {designation ? `${designation} at ` : ""}
              {company.name}
            </Link>
          )}
          <span className="text-hint text-emce-text-muted">
            · {relativeTime(row.createdAt)}
          </span>
        </div>
        {row.application && (
          <p className="mt-1 text-hint text-emce-text-sec">
            About your application to{" "}
            <Link
              href={`/job/${row.application.job.slug}`}
              className="font-bold text-emce-dark hover:underline"
            >
              {row.application.job.title}
            </Link>
          </p>
        )}
        {row.message && (
          <p className="mt-2 whitespace-pre-line rounded-md bg-white/60 p-2 text-sm text-emce-text">
            {row.message}
          </p>
        )}
      </div>
    </div>
  );
}
