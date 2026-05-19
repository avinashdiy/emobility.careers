/**
 * CSV export of every candidate registered for a recruitment drive.
 * Columns line up with the placement-team's requested Recruitathon
 * fields so they can drop the file straight into the spreadsheet they
 * email to participating employers.
 *
 * Hand-rolled CSV (no PapaParse / csv-stringify dependency added) —
 * the column count is small + stable + escape rules are simple. If we
 * ever grow this to multi-sheet exports, swap in @fast-csv/format.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const { slug } = await params;

  const drive = await db.recruitmentDrive.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true },
  });
  if (!drive) return new NextResponse("Fair not found", { status: 404 });

  const rows = await db.recruitmentDriveRegistration.findMany({
    where: { driveId: drive.id },
    orderBy: { createdAt: "asc" },
    select: {
      checkInCode: true, source: true, createdAt: true, intentNote: true,
      fairMode: true, intendedRoles: true, willingLocations: true,
      formAnswers: true, checkedInAt: true,
      viaTpoCell: {
        select: {
          institution: { select: { name: true } },
          contactName: true,
          contactEmail: true,
        },
      },
      candidate: {
        select: {
          firstName: true, lastName: true, email: true, phone: true,
          linkedinUrl: true, isDIYguruVerified: true, profileCompleteness: true,
          resumeUrl: true,
          education: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { institution: true, degree: true, field: true },
          },
          skills: {
            take: 30,
            select: { skill: { select: { name: true } } },
          },
          user: { select: { emailVerifiedAt: true } },
        },
      },
    },
  });

  const header = [
    "Check-in code",
    "Full name",
    "Email",
    "Email verified",
    "Phone",
    "LinkedIn",
    "DIYguru student",
    "College / institute",
    "Course",
    "Specialization / field",
    "Year of study",
    "Experience level",
    "EV / automotive experience",
    "Roles interested",
    "Willing locations",
    "Technical skills",
    "Internship / project summary",
    "Fair mode availability",
    "Intent note",
    "Resume URL",
    "Profile completeness %",
    "Source",
    "Via TPO college",
    "Via TPO name",
    "Via TPO email",
    "Checked in at",
    "Registered at",
  ];

  const lines: string[] = [toCsvRow(header)];
  for (const r of rows) {
    const c = r.candidate;
    const fullName = `${c.firstName} ${c.lastName ?? ""}`.trim();
    const fa = (r.formAnswers ?? {}) as Record<string, unknown>;
    const edu = c.education[0];
    lines.push(
      toCsvRow([
        r.checkInCode,
        fullName,
        c.email ?? "",
        c.user.emailVerifiedAt ? "Yes" : "No",
        c.phone ?? "",
        c.linkedinUrl ?? "",
        c.isDIYguruVerified ? "Yes" : "No",
        edu?.institution ?? "",
        edu?.degree ?? "",
        edu?.field ?? "",
        String(fa.yearOfStudy ?? ""),
        String(fa.experienceLevel ?? ""),
        fa.hasEvExperience ? "Yes" : "No",
        r.intendedRoles ?? "",
        r.willingLocations ?? "",
        c.skills.map((s) => s.skill.name).join("; "),
        String(fa.internshipSummary ?? ""),
        r.fairMode ?? "",
        r.intentNote ?? "",
        c.resumeUrl ?? "",
        c.profileCompleteness,
        r.source,
        r.viaTpoCell?.institution.name ?? "",
        r.viaTpoCell?.contactName ?? "",
        r.viaTpoCell?.contactEmail ?? "",
        r.checkedInAt ? r.checkedInAt.toISOString() : "",
        r.createdAt.toISOString(),
      ]),
    );
  }

  // BOM (﻿) so Excel opens it as UTF-8 + recognises non-ASCII
  // characters (Hindi names, diacritics) correctly without prompting.
  const body = "﻿" + lines.join("\n") + "\n";
  const filename = `recruitathon-candidates-${drive.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
