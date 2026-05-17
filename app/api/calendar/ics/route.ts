import type { NextRequest } from "next/server";
import crypto from "crypto";

/**
 * Generic ICS-file emitter. Takes title / start / end / location /
 * description as URL params and returns a single-event calendar
 * file the user's OS calendar app can import (Apple Calendar,
 * Google Calendar via "Add file", Outlook).
 *
 * Used today by the fair-pass page (`/me/fairs/[slug]/pass`) so a
 * candidate can drop the fair into their calendar in one tap. Made
 * generic on purpose — interview reminders, mentor sessions, and
 * campus drives can reuse this without each maintaining a custom
 * generator.
 *
 * Caching: ICS bytes are deterministic from the URL params, so we
 * set a long `Cache-Control: public, max-age=3600` to let the
 * browser short-circuit re-downloads. The UID hash is also derived
 * from the params so the same event minted twice = same UID, which
 * makes calendar apps merge instead of duplicate.
 */
export function GET(req: NextRequest) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title") ?? "Event";
  const startISO = url.searchParams.get("start") ?? "";
  const endISO = url.searchParams.get("end") ?? "";
  const location = url.searchParams.get("location") ?? "";
  const description = url.searchParams.get("description") ?? "";

  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (!start || !end) {
    return new Response("Invalid start/end", { status: 400 });
  }

  // UID is a stable hash of all four user-visible params so the
  // same /api/calendar/ics?... URL produces the same ICS UID
  // (calendar apps dedupe on UID).
  const uid = crypto
    .createHash("sha256")
    .update(`${title}|${startISO}|${endISO}|${location}|${description}`)
    .digest("hex")
    .slice(0, 32) + "@emobility.careers";

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//emobility.careers//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    location ? `LOCATION:${icsEscape(location)}` : "",
    description ? `DESCRIPTION:${icsEscape(description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");

  const fileName = (title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}.ics"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ICS format requires UTC timestamps in YYYYMMDDTHHMMSSZ form
 * (no separators, trailing Z). All-day events use the date-only
 * VALUE=DATE shape which we don't need here.
 */
function toIcsDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Escape commas, semicolons, and backslashes per RFC 5545 §3.3.11.
 * Newlines become literal `\n` since unescaped CR/LF would break
 * the multi-line property parser.
 */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
