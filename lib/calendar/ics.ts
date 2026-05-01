/**
 * Tiny RFC 5545 ICS file generator. Hand-rolled because the npm
 * options (ical-generator, ics) bring large transitive deps for
 * what is, mechanically, just string concatenation.
 *
 * The output is enough for Google Calendar / Outlook / Apple Calendar
 * to import a single event. We don't bother with VTIMEZONE because
 * the timestamps are emitted in UTC (Zulu), which every modern
 * calendar handles correctly.
 *
 * Usage:
 *   const ics = buildICS({
 *     uid, summary, description, startsAt, durationMins,
 *     organizerEmail, organizerName, attendees: [{ email, name }],
 *     location, url,
 *   });
 *   await sendMail({ to, subject, html, text, icsAttachment: ics });
 */

export interface ICSEventInput {
  /// Stable unique id for the event — use the row's `icsUid`. RFC
  /// requires it; calendars dedupe on this so reschedules update
  /// the existing event instead of creating a new one.
  uid: string;
  /// Optional: bump on reschedule so calendars re-process. Default 0.
  sequence?: number;
  /// Plain-text title.
  summary: string;
  description: string;
  /// Event start. We emit as UTC.
  startsAt: Date;
  durationMins: number;
  organizerEmail: string;
  organizerName?: string;
  attendees?: { email: string; name?: string; rsvp?: boolean }[];
  /// Display location text (URL works too — Google Calendar makes it clickable).
  location?: string;
  /// Canonical web URL of the event — surfaces as a `URL` property.
  url?: string;
  /// Status — CONFIRMED for new bookings, CANCELLED to retract.
  status?: "CONFIRMED" | "CANCELLED" | "TENTATIVE";
}

function fmtUTC(d: Date): string {
  // YYYYMMDDTHHmmssZ — strip dashes/colons/ms.
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(s: string): string {
  // RFC 5545 §3.3.11 — escape backslash, comma, semicolon, newline.
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line: string): string {
  // RFC 5545 §3.1: lines longer than 75 octets get folded with CRLF + space.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let remaining = line;
  out.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    out.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return out.join("\r\n");
}

export function buildICS(input: ICSEventInput): string {
  const dtStart = fmtUTC(input.startsAt);
  const dtEnd = fmtUTC(new Date(input.startsAt.getTime() + input.durationMins * 60_000));
  const dtStamp = fmtUTC(new Date());

  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//eMobility Careers//Mentorship//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:REQUEST");
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${escapeText(input.uid)}`);
  lines.push(`SEQUENCE:${input.sequence ?? 0}`);
  lines.push(`DTSTAMP:${dtStamp}`);
  lines.push(`DTSTART:${dtStart}`);
  lines.push(`DTEND:${dtEnd}`);
  lines.push(`SUMMARY:${escapeText(input.summary)}`);
  lines.push(`DESCRIPTION:${escapeText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push(`STATUS:${input.status ?? "CONFIRMED"}`);
  // Organiser
  const orgName = input.organizerName ? `;CN=${escapeText(input.organizerName)}` : "";
  lines.push(`ORGANIZER${orgName}:mailto:${input.organizerEmail}`);
  // Attendees
  for (const a of input.attendees ?? []) {
    const cn = a.name ? `;CN=${escapeText(a.name)}` : "";
    const rsvp = a.rsvp === false ? "" : ";RSVP=TRUE";
    lines.push(
      `ATTENDEE${cn}${rsvp};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${a.email}`,
    );
  }
  // Reminder — 30 min pop-up
  lines.push("BEGIN:VALARM");
  lines.push("ACTION:DISPLAY");
  lines.push("DESCRIPTION:Mentorship session reminder");
  lines.push("TRIGGER:-PT30M");
  lines.push("END:VALARM");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.map(fold).join("\r\n");
}
