import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmployerShell } from "@/components/layout/employer-shell";
import { Calendar, Plus } from "lucide-react";

export const metadata = { title: "Events — Employer" };

const statusVariant: Record<string, "default" | "outline" | "warning" | "success"> = {
  DRAFT: "outline",
  OPEN: "success",
  CANCELLED: "warning",
  COMPLETED: "outline",
};

const eventTypeLabel: Record<string, string> = {
  WEBINAR: "Webinar",
  IN_PERSON: "In person",
  HYBRID: "Hybrid",
};

function formatShort(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

export default async function EmployerEventsList() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/employer/events");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }

  const isAdmin = session.user.role === "ADMIN";
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: { select: { id: true, name: true, slug: true } } },
  });
  // Admins see ALL events across companies for moderation. Non-admin
  // employers must complete employer onboarding first.
  if (!isAdmin && (!employer || !employer.companyId)) redirect("/employer/onboarding");

  const events = await db.event.findMany({
    where: isAdmin ? {} : { companyId: employer!.companyId! },
    orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    take: 100,
    include: {
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      // Surface the company name on admin view so they know which one
      // each row belongs to.
      company: isAdmin ? { select: { name: true, slug: true } } : false,
    },
  });

  return (
    <EmployerShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Events &amp; webinars</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              {isAdmin ? (
                <>
                  Admin view — moderating events across <strong>all companies</strong>.
                  Drafts are private; OPEN events show publicly.
                </>
              ) : (
                <>
                  Manage events for {employer!.company!.name}. Drafts are private; OPEN
                  events show on{" "}
                  <code className="rounded bg-emce-light-soft px-1">/events</code> and the
                  company page.
                </>
              )}
            </p>
          </div>
          {!isAdmin && (
            <Button asChild>
              <Link href="/employer/events/new">
                <Plus className="mr-1 h-4 w-4" /> New event
              </Link>
            </Button>
          )}
        </header>

        {events.length === 0 ? (
          <Card className="p-10 text-center">
            <Calendar className="mx-auto h-10 w-10 text-emce-mid-muted" />
            <p className="mt-3 text-sm font-bold text-emce-text">No events yet</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Host a webinar, recruiter Q&amp;A, or in-person meet-up to engage candidates
              before they apply.
            </p>
            <Button asChild className="mt-4">
              <Link href="/employer/events/new">Create your first event</Link>
            </Button>
          </Card>
        ) : (
          <ul className="emce-stagger space-y-3">
            {events.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={statusVariant[e.status]} className="text-[10px]">
                          {e.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {eventTypeLabel[e.eventType]}
                        </Badge>
                      </div>
                      <h3 className="mt-1 text-sm font-extrabold text-emce-text">{e.title}</h3>
                      <p className="text-hint text-emce-text-sec">
                        {/* Admins see the owning company on each row so
                            cross-company moderation is unambiguous. */}
                        {isAdmin && "company" in e && e.company && (
                          <>
                            <Link
                              href={`/company/${e.company.slug}`}
                              className="font-bold text-emce-dark hover:underline"
                            >
                              {e.company.name}
                            </Link>
                            {" · "}
                          </>
                        )}
                        {formatShort(e.startsAt, e.timezone)}
                        {" · "}
                        {e._count.registrations}
                        {e.capacity !== null && ` / ${e.capacity}`} registered
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/employer/events/${e.id}`}>Manage</Link>
                      </Button>
                      {e.status !== "DRAFT" && (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/events/${e.slug}`}>View public</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </EmployerShell>
  );
}
