import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { EventEditor } from "@/components/events/EventEditor";

export const metadata = { title: "Manage event" };

export default async function ManageEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/employer/events/${id}`);
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    redirect("/403");
  }
  const isAdmin = session.user.role === "ADMIN";
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!isAdmin && !employer?.companyId) redirect("/employer/onboarding");

  // Admins can manage any company's events; non-admin recruiters are
  // scoped to their own company. Lookup uses `findFirst` with a
  // dynamic where clause to keep the cross-company gate honest.
  const event = await db.event.findFirst({
    where: isAdmin ? { id } : { id, companyId: employer!.companyId! },
    include: {
      registrations: {
        where: { status: "REGISTERED" },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              candidateProfile: {
                select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true, headline: true },
              },
            },
          },
        },
      },
    },
  });
  if (!event) notFound();

  return (
    <EmployerShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <Link href="/employer/events" className="text-xs font-bold text-emce-dark hover:underline">
            ← Events
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-dashboard text-emce-text md:text-3xl">{event.title}</h1>
            <Badge variant="outline">{event.status}</Badge>
          </div>
          {event.status !== "DRAFT" && (
            <p className="mt-1 text-sm text-emce-text-sec">
              Public link:{" "}
              <Link href={`/events/${event.slug}`} className="font-bold text-emce-dark hover:underline">
                /events/{event.slug}
              </Link>
            </p>
          )}
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <EventEditor event={event} />
          </div>

          <aside>
            <Card className="p-6">
              <h2 className="text-section text-emce-text">
                Registrations · {event.registrations.length}
                {event.capacity !== null && ` / ${event.capacity}`}
              </h2>
              {event.registrations.length === 0 ? (
                <p className="mt-2 text-hint text-emce-text-muted">
                  No one&apos;s registered yet. Once status is OPEN, registrations will appear here.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {event.registrations.map((r) => {
                    const cp = r.user.candidateProfile;
                    const name = cp
                      ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
                      : r.user.name ?? r.user.email ?? "Someone";
                    return (
                      <li key={r.id}>
                        <div className="flex items-start gap-2">
                          {cp ? (
                            <Link href={`/${cp.slug}`} className="shrink-0">
                              <Avatar src={cp.profilePhotoUrl} name={name} size="sm" />
                            </Link>
                          ) : (
                            <Avatar name={name} size="sm" />
                          )}
                          <div className="min-w-0 flex-1">
                            {cp ? (
                              <Link
                                href={`/${cp.slug}`}
                                className="line-clamp-1 text-sm font-bold text-emce-text hover:underline"
                              >
                                {name}
                              </Link>
                            ) : (
                              <p className="line-clamp-1 text-sm font-bold text-emce-text">{name}</p>
                            )}
                            {cp?.headline && (
                              <p className="line-clamp-1 text-hint text-emce-text-sec">{cp.headline}</p>
                            )}
                            {r.notes && (
                              <p className="mt-1 line-clamp-3 text-hint text-emce-text-muted">
                                &ldquo;{r.notes}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </EmployerShell>
  );
}
