/**
 * ICS calendar export of every interview slot the signed-in candidate
 * has booked for a given fair. One VEVENT per slot. Importable into
 * Google Calendar, Apple Calendar, Outlook, etc.
 *
 * Pure-text generation — no library needed. The ICS spec is forgiving
 * (RFC 5545); the minimal set we emit (VCALENDAR + VEVENT with UID,
 * DTSTAMP, DTSTART, DTEND, SUMMARY, LOCATION, DESCRIPTION, URL) works
 * across every major calendar client.
 *
 * Returns 200 with an empty calendar when the candidate has no booked
 * slots yet — easier to "subscribe" to a URL that's empty than to
 * deal with a 404, since some calendar clients refuse to add a feed
 * that doesn't 200.
 */

import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function escapeIcs(text: string): string {
  // RFC 5545 §3.3.11 — escape commas, semicolons, backslashes, and
  // collapse newlines to literal \n. Then fold lines longer than 75
  // octets at the closest whitespace (most clients tolerate longer,
  // but Outlook is strict).
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUtcStamp(date: Date): string {
  // YYYYMMDDTHHmmssZ — ICS basic-format UTC timestamp.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function foldLine(line: string): string {
  // RFC 5545 §3.1 — lines > 75 octets fold with CRLF + space.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/signin?next=${encodeURIComponent(`/me/fairs/${(await params).slug}/pass`)}`);
  }
  const { slug } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { id: true, title: true, slug: true, venueName: true, venueAddress: true, city: true, state: true },
  });
  if (!drive) notFound();

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) notFound();

  // Booked slots at any booth at this fair. Filter by status to skip
  // CANCELLED slots; AVAILABLE shouldn't be in candidate's list anyway
  // since they're booth-public until booked.
  const slots = await db.recruitmentDriveInterviewSlot.findMany({
    where: {
      candidateId: profile.id,
      driveCompany: { driveId: drive.id },
      status: { in: ["BOOKED"] },
    },
    orderBy: { startsAt: "asc" },
    include: {
      driveCompany: {
        include: {
          company: { select: { name: true, slug: true } },
        },
      },
      job: { select: { title: true, slug: true } },
    },
  });

  const now = new Date();
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const venue = [drive.venueName, drive.venueAddress, drive.city, drive.state]
    .filter(Boolean)
    .join(", ");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//emobility.careers//Recruitathon//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(drive.title)} — your interview slots`,
    `X-WR-TIMEZONE:Asia/Kolkata`,
  ];

  for (const slot of slots) {
    const ends = new Date(slot.startsAt.getTime() + slot.durationMinutes * 60_000);
    const company = slot.driveCompany.company;
    const jobTitle = slot.job?.title ?? "interview";
    const summary = `${jobTitle} — ${company.name}`;
    const description = [
      `Booth: ${slot.driveCompany.boothLabel ?? "TBA"}`,
      `Duration: ${slot.durationMinutes} minutes`,
      slot.notes ? `Notes from recruiter: ${slot.notes}` : null,
      ``,
      `Fair: ${drive.title}`,
      `View booth: ${baseUrl}/fairs/${drive.slug}/booths/${slot.driveCompanyId}/slots`,
    ]
      .filter((x): x is string => x !== null)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      // UID — stable + globally unique. Including the slot id means the
      // calendar client will UPDATE the event on re-import rather than
      // duplicating it. RFC 5545 §3.8.4.7 reserves @ as a delimiter.
      foldLine(`UID:slot-${slot.id}@emobility.careers`),
      `DTSTAMP:${formatUtcStamp(now)}`,
      `DTSTART:${formatUtcStamp(slot.startsAt)}`,
      `DTEND:${formatUtcStamp(ends)}`,
      foldLine(`SUMMARY:${escapeIcs(summary)}`),
      foldLine(`LOCATION:${escapeIcs(venue)}`),
      foldLine(`DESCRIPTION:${escapeIcs(description)}`),
      foldLine(`URL:${baseUrl}/me/fairs/${drive.slug}/pass`),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  // CRLF line endings per RFC 5545 §3.1.
  const body = lines.join("\r\n") + "\r\n";
  const filename = `recruitathon-${drive.slug}-${profile.id}.ics`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
