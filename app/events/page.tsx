import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Calendar, MapPin, Video } from "lucide-react";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Events & Webinars",
  description:
    "Live events and webinars from EV companies hiring on eMobility Careers — battery, charging, motors, vehicles, software.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/events` },
};

const eventTypeLabel: Record<string, string> = {
  WEBINAR: "Webinar",
  IN_PERSON: "In person",
  HYBRID: "Hybrid",
};

const eventTypeIcon: Record<string, typeof Video> = {
  WEBINAR: Video,
  IN_PERSON: MapPin,
  HYBRID: Calendar,
};

function formatEventTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}

export default async function EventsListPage() {
  // Public list = OPEN, future, ordered by start time. We render
  // CANCELLED separately so registered users still see the change.
  const now = new Date();
  const [upcoming, ongoing] = await Promise.all([
    db.event.findMany({
      where: {
        status: { in: ["OPEN", "CANCELLED"] },
        startsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      take: 50,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
    }),
    db.event.findMany({
      where: {
        status: "OPEN",
        startsAt: { lt: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
      orderBy: { startsAt: "desc" },
      take: 10,
      include: {
        company: { select: { name: true, slug: true, logoUrl: true } },
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
    }),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">
            Events &amp; Webinars
          </h1>
          <p className="mt-2 text-emce-text-sec">
            Live and upcoming events from EV companies hiring on the platform — product
            demos, recruiter Q&amp;As, technical deep-dives.
          </p>
        </header>

        {ongoing.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-emce-orange">
              🔴 Live now
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ongoing.map((e) => (
                <EventCard key={e.id} event={e} live />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-emce-text-sec">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm font-bold text-emce-text">No upcoming events yet</p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Companies are setting up — check back soon, or{" "}
                <Link href="/companies" className="font-bold text-emce-dark hover:underline">
                  browse companies
                </Link>{" "}
                to follow the ones you&apos;re interested in.
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

interface EventForCard {
  id: string;
  slug: string;
  title: string;
  description: string;
  eventType: "WEBINAR" | "IN_PERSON" | "HYBRID";
  status: "DRAFT" | "OPEN" | "CANCELLED" | "COMPLETED";
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  location: string | null;
  coverImageUrl: string | null;
  capacity: number | null;
  company: { name: string; slug: string; logoUrl: string | null };
  _count: { registrations: number };
}

function EventCard({ event, live = false }: { event: EventForCard; live?: boolean }) {
  const Icon = eventTypeIcon[event.eventType];
  const cancelled = event.status === "CANCELLED";
  return (
    <Link
      href={`/events/${event.slug}`}
      className="block rounded-lg border border-emce-border bg-white shadow-emce transition hover:border-emce-mid hover:shadow-emce-hover"
    >
      {event.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.coverImageUrl}
          alt=""
          className="h-32 w-full rounded-t-lg object-cover"
        />
      ) : (
        <div className="emce-hero-gradient h-32 rounded-t-lg" />
      )}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <Avatar src={event.company.logoUrl} name={event.company.name} size="sm" />
          <span className="text-xs font-bold text-emce-text-sec">{event.company.name}</span>
          <Badge variant={live ? "warning" : "outline"} className="ml-auto text-[10px]">
            <Icon className="mr-1 h-3 w-3" />
            {eventTypeLabel[event.eventType]}
          </Badge>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-extrabold text-emce-text">
          {event.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
          {event.description}
        </p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="font-semibold text-emce-text">
            {formatEventTime(event.startsAt, event.timezone)}
          </span>
          {cancelled ? (
            <Badge variant="outline" className="text-[10px] text-emce-orange">
              Cancelled
            </Badge>
          ) : (
            <span className="text-emce-text-muted">
              {event._count.registrations} registered
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
