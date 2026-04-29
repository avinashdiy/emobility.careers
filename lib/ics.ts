/**
 * Minimal RFC 5545 ICS generator for interview invites.
 * No dependency — keeps the bundle small.
 */

interface ICSEvent {
  uid: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  organizerEmail?: string;
  organizerName?: string;
  attendees?: { email: string; name?: string }[];
}

function formatICSDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export function generateICS(event: ICSEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//eMobility Careers//Interview//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(event.start)}`,
    `DTEND:${formatICSDate(event.end)}`,
    `SUMMARY:${escape(event.summary)}`,
  ];
  if (event.description) lines.push(`DESCRIPTION:${escape(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
  if (event.organizerEmail) {
    lines.push(`ORGANIZER;CN=${escape(event.organizerName ?? "")}:mailto:${event.organizerEmail}`);
  }
  for (const a of event.attendees ?? []) {
    lines.push(`ATTENDEE;CN=${escape(a.name ?? "")};RSVP=TRUE:mailto:${a.email}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
