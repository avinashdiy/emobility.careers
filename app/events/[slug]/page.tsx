import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Calendar, Clock, MapPin, Video, Users } from "lucide-react";
import {
  registerForEvent,
  cancelEventRegistration,
} from "@/server/events/actions";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { env } from "@/lib/env";
import { htmlOrFallback, stripHtml } from "@/lib/cms/job-sanitize";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const event = await db.event.findUnique({
    where: { slug },
    select: {
      title: true,
      description: true,
      coverImageUrl: true,
      status: true,
      company: { select: { name: true } },
    },
  });
  if (!event || event.status === "DRAFT") {
    return { title: "Event", robots: { index: false, follow: false } };
  }
  // Strip HTML tags before slicing — descriptions are now rich text,
  // so `<p>` / `<strong>` / `<a>` would otherwise leak into the
  // meta-description tag and OG / Twitter cards.
  const metaDescription = stripHtml(event.description).slice(0, 200);
  // Branded /og/home.jpg fallback so an event without a cover image
  // still unfurls with an image rather than a favicon.
  const ogImage = event.coverImageUrl ?? "/og/home.jpg";
  return {
    title: `${event.title} — ${event.company.name}`,
    description: metaDescription,
    openGraph: {
      title: `${event.title} — ${event.company.name}`,
      description: metaDescription,
      images: [{ url: ogImage }],
      siteName: "eMobility Careers",
    },
    twitter: {
      card: "summary_large_image",
      title: `${event.title} — ${event.company.name}`,
      description: metaDescription,
      images: [ogImage],
    },
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/events/${slug}` },
  };
}

const eventTypeLabel = {
  WEBINAR: "Online webinar",
  IN_PERSON: "In-person event",
  HYBRID: "Hybrid (online + in person)",
} as const;

function formatFull(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  }).format(d);
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const event = await db.event.findUnique({
    where: { slug },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          description: true,
          ownerUserId: true,
        },
      },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  });
  if (!event) notFound();

  // DRAFT events are hidden from everyone except the company's
  // recruiters (anyone with an EmployerProfile linked to the same
  // company), the company owner, the event creator, and admins. This
  // gives hosts a "preview before publishing" surface that uses the
  // exact same renderer the public will see.
  let canPreviewDraft = false;
  if (event.status === "DRAFT" && session?.user) {
    if (session.user.role === "ADMIN") {
      canPreviewDraft = true;
    } else if (event.createdById === session.user.id) {
      canPreviewDraft = true;
    } else if (event.company.ownerUserId === session.user.id) {
      canPreviewDraft = true;
    } else {
      const employer = await db.employerProfile.findFirst({
        where: { userId: session.user.id, companyId: event.company.id },
        select: { id: true },
      });
      if (employer) canPreviewDraft = true;
    }
  }
  if (event.status === "DRAFT" && !canPreviewDraft) notFound();

  const viewerRegistration = session?.user
    ? await db.eventRegistration.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: session.user.id } },
        select: { status: true },
      })
    : null;
  const isRegistered = viewerRegistration?.status === "REGISTERED";

  const isPast =
    event.endsAt ? event.endsAt < new Date() : event.startsAt < new Date();
  const cancelled = event.status === "CANCELLED";
  const isFull =
    event.capacity !== null && event._count.registrations >= event.capacity;

  return (
    <>
      <SiteHeader />
      <main className="container max-w-3xl py-8">
        {event.status === "DRAFT" && canPreviewDraft && (
          <div className="mb-4 rounded-md border border-emce-orange bg-emce-orange-light p-3 text-sm">
            <p className="font-bold text-emce-orange-deep">🟡 Draft preview</p>
            <p className="mt-1 text-emce-text">
              This event isn&apos;t live yet — only you and other{" "}
              {event.company.name} recruiters can see this page. Flip the status
              to <strong>OPEN</strong> in{" "}
              <Link
                href={`/employer/events/${event.id}`}
                className="font-bold text-emce-dark underline"
              >
                manage event
              </Link>{" "}
              to publish it.
            </p>
          </div>
        )}

        <Link
          href="/events"
          className="text-xs font-bold text-emce-dark hover:underline"
        >
          ← All events
        </Link>

        {event.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.coverImageUrl}
            alt=""
            className="mt-3 h-48 w-full rounded-lg object-cover sm:h-64"
          />
        ) : (
          <div className="emce-hero-gradient mt-3 h-48 rounded-lg sm:h-64" />
        )}

        <header className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{eventTypeLabel[event.eventType]}</Badge>
            {cancelled && <Badge variant="outline" className="text-emce-orange-deep">Cancelled</Badge>}
            {isPast && !cancelled && <Badge variant="outline">Past event</Badge>}
          </div>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight text-emce-text md:text-3xl">
            {event.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/company/${event.company.slug}`}
              className="inline-flex items-center gap-2 hover:underline"
            >
              <Avatar src={event.company.logoUrl} name={event.company.name} size="sm" />
              <span className="font-semibold text-emce-text">{event.company.name}</span>
            </Link>
            <ShareDropdown
              url={`${env.NEXT_PUBLIC_APP_URL}/events/${event.slug}`}
              title={`${event.title} — ${event.company.name}`}
              description={stripHtml(event.description).slice(0, 200)}
              label="Share event"
            />
          </div>
        </header>

        <Card className="mt-5">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1 font-bold text-emce-text">
                <Calendar className="h-4 w-4 text-emce-mid" /> Starts
              </dt>
              <dd className="text-emce-text-sec">{formatFull(event.startsAt, event.timezone)}</dd>
            </div>
            {event.endsAt && (
              <div>
                <dt className="flex items-center gap-1 font-bold text-emce-text">
                  <Clock className="h-4 w-4 text-emce-mid" /> Ends
                </dt>
                <dd className="text-emce-text-sec">{formatFull(event.endsAt, event.timezone)}</dd>
              </div>
            )}
            {event.location && (
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1 font-bold text-emce-text">
                  <MapPin className="h-4 w-4 text-emce-mid" /> Location
                </dt>
                <dd className="text-emce-text-sec">{event.location}</dd>
              </div>
            )}
            {event.meetingUrl && isRegistered && !cancelled && (
              <div className="sm:col-span-2">
                <dt className="flex items-center gap-1 font-bold text-emce-text">
                  <Video className="h-4 w-4 text-emce-mid" /> Meeting link
                </dt>
                <dd>
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all font-bold text-emce-dark hover:underline"
                  >
                    {event.meetingUrl}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="flex items-center gap-1 font-bold text-emce-text">
                <Users className="h-4 w-4 text-emce-mid" /> Registered
              </dt>
              <dd className="text-emce-text-sec">
                {event._count.registrations}
                {event.capacity !== null && ` / ${event.capacity}`}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="mt-3">
          <h2 className="text-section text-emce-text">About this event</h2>
          <div
            className="prose prose-sm mt-3 max-w-none text-body text-emce-text-sec"
            dangerouslySetInnerHTML={{ __html: htmlOrFallback(event.description) }}
          />
        </Card>

        {/* Registration block */}
        <Card className="mt-3">
          {!session?.user ? (
            <div>
              <h2 className="text-section text-emce-text">Register for this event</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                <Link href={`/signin?next=/events/${slug}`} className="font-bold text-emce-dark hover:underline">
                  Sign in
                </Link>{" "}
                to register and get the joining details.
              </p>
            </div>
          ) : cancelled ? (
            <div>
              <h2 className="text-section text-emce-orange-deep">Event cancelled</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                The host has called off this event. Check{" "}
                <Link href={`/company/${event.company.slug}`} className="font-bold text-emce-dark hover:underline">
                  {event.company.name}
                </Link>
                &rsquo;s page for any rescheduled dates.
              </p>
            </div>
          ) : isPast ? (
            <div>
              <h2 className="text-section text-emce-text">Past event</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                This event has finished. Follow the host to be notified about future ones.
              </p>
            </div>
          ) : isRegistered ? (
            <div>
              <h2 className="text-section text-emce-text">✓ You&apos;re registered</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                The joining details are visible above. We&apos;ll send a reminder closer to the date.
              </p>
              <form action={cancelEventRegistration} className="mt-3">
                <input type="hidden" name="eventId" value={event.id} />
                <Button type="submit" size="sm" variant="outline">Cancel registration</Button>
              </form>
            </div>
          ) : isFull ? (
            <div>
              <h2 className="text-section text-emce-text">Event is full</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                {event.capacity} seats already taken. Follow{" "}
                <Link href={`/company/${event.company.slug}`} className="font-bold text-emce-dark hover:underline">
                  {event.company.name}
                </Link>{" "}
                for similar future events.
              </p>
            </div>
          ) : (
            <form action={registerForEvent} className="space-y-3">
              <h2 className="text-section text-emce-text">Register for this event</h2>
              <input type="hidden" name="eventId" value={event.id} />
              <div>
                <Label htmlFor="notes">Anything you want to share with the host? (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
                  maxLength={1000}
                  placeholder="Questions you want answered, what brought you here, etc."
                />
              </div>
              <Button type="submit">Register</Button>
            </form>
          )}
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
