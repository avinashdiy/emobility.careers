/**
 * ICS calendar export for a single interview the signed-in candidate
 * has been scheduled into. Companion to `/me/fairs/[slug]/slots.ics`
 * but scoped to a single interview row (not a batch of fair slots).
 *
 * Why this exists: `Interview.icsUid` has been on the schema since
 * v1 (used as the stable UID so calendar clients update vs. duplicate
 * on re-import), but no download endpoint was ever wired. Candidates
 * who got an interview scheduled saw the time + meeting link on
 * `/me/interviews` but had no one-click way to drop it on their
 * personal calendar. This closes that gap.
 *
 * Authorization: the requester must be the candidate the interview
 * was scheduled for. Recruiter-side ICS (for hiring panel) is a
 * future enhancement — interviewer emails live on
 * `Interview.interviewerIds` but those are User ids, not necessarily
 * panel members of a specific company.
 */

import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function escapeIcs(text: string): string {
  // RFC 5545 §3.3.11 — escape commas, semicolons, backslashes, and
  // collapse newlines to literal \n.
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUtcStamp(date: Date): string {
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
  // RFC 5545 §3.1 — fold lines > 75 octets at column 73 with `CRLF + space`.
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
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/signin?next=${encodeURIComponent(`/me/interviews`)}`);
  }
  const { id } = await params;

  const interview = await db.interview.findUnique({
    where: { id },
    select: {
      id: true,
      scheduledAt: true,
      durationMins: true,
      mode: true,
      location: true,
      meetingUrl: true,
      icsUid: true,
      status: true,
      application: {
        select: {
          candidate: { select: { userId: true } },
          job: {
            select: {
              title: true,
              slug: true,
              company: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });
  if (!interview) notFound();

  // Auth gate — only the candidate the interview is for can pull
  // their own ICS. Recruiter-side calendar sync is a separate feature.
  if (interview.application.candidate.userId !== session.user.id) {
    redirect("/403");
  }

  const ends = new Date(
    interview.scheduledAt.getTime() + interview.durationMins * 60_000,
  );
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const job = interview.application.job;
  const company = job.company;

  // Build the location string — for video the meeting URL is the
  // location-as-it-were; for in-person we use the venue address;
  // for hybrid we list both since either could be relevant on the day.
  let location = "";
  if (interview.mode === "VIDEO" && interview.meetingUrl) {
    location = interview.meetingUrl;
  } else if (interview.mode === "ONSITE" && interview.location) {
    location = interview.location;
  } else if (interview.location) {
    location = `${interview.location}${interview.meetingUrl ? ` · ${interview.meetingUrl}` : ""}`;
  }

  const summary = `${job.title} interview — ${company.name}`;
  const description = [
    `Job: ${job.title}`,
    `Company: ${company.name}`,
    `Mode: ${interview.mode}`,
    `Duration: ${interview.durationMins} minutes`,
    interview.meetingUrl ? `Meeting link: ${interview.meetingUrl}` : null,
    interview.location ? `Location: ${interview.location}` : null,
    ``,
    `Status: ${interview.status}`,
    `View on emobility.careers: ${baseUrl}/me/interviews`,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");

  // Stable UID — `icsUid` minted at schedule time. Falls back to a
  // composed identifier if the column is empty (legacy interviews
  // created before icsUid was added).
  const uid = interview.icsUid ?? `interview-${interview.id}@emobility.careers`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//emobility.careers//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcs(summary)}`),
    "X-WR-TIMEZONE:Asia/Kolkata",
    "BEGIN:VEVENT",
    foldLine(`UID:${uid}`),
    `DTSTAMP:${formatUtcStamp(new Date())}`,
    `DTSTART:${formatUtcStamp(interview.scheduledAt)}`,
    `DTEND:${formatUtcStamp(ends)}`,
    foldLine(`SUMMARY:${escapeIcs(summary)}`),
    foldLine(`LOCATION:${escapeIcs(location)}`),
    foldLine(`DESCRIPTION:${escapeIcs(description)}`),
    foldLine(`URL:${baseUrl}/me/interviews`),
    `STATUS:${interview.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const body = lines.join("\r\n") + "\r\n";
  const filename = `interview-${interview.id}.ics`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
