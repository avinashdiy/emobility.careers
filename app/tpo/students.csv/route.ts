/**
 * CSV export of every student who registered for a Recruitathon via
 * THIS placement officer's invite link (scoped to their own college
 * cell — a TPO can only ever see their own students). Mirrors the
 * admin candidates.csv hand-rolled CSV pattern.
 *
 * The TPO shares /fairs/[slug]/register?as=candidate&tpo=<token>;
 * every registration through it is tagged viaTpoCellId = cell.id, which
 * is the filter here.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

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

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true },
  });
  if (!user || (user.role !== "ADMIN" && !user.isPlacementOfficer)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  // The viewer's own approved placement cell. A TPO can export only
  // their own college's students — there is no cross-cell access here.
  const cell = await db.collegePlacementCell.findFirst({
    where: { createdById: session.user.id, status: "APPROVED" },
    select: { id: true, institution: { select: { name: true } } },
  });
  if (!cell) {
    return new NextResponse(
      "No approved placement cell found for your account.",
      { status: 403 },
    );
  }

  const rows = await db.recruitmentDriveRegistration.findMany({
    where: { viaTpoCellId: cell.id },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      checkedInAt: true,
      fairMode: true,
      intendedRoles: true,
      willingLocations: true,
      formAnswers: true,
      drive: { select: { title: true } },
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          slug: true,
          profileCompleteness: true,
          city: true,
          graduationYear: true,
          skills: { select: { skill: { select: { name: true } } } },
          education: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { institution: true, degree: true, field: true },
          },
        },
      },
    },
  });

  const appUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const HEADERS = [
    "Name",
    "Email",
    "Phone",
    "City",
    "College / institute",
    "Qualification",
    "Branch / specialization",
    "Graduation year",
    "Year of study",
    "Status",
    "EV domains",
    "Fair",
    "Fair mode",
    "Roles interested",
    "Willing locations",
    "Key skills",
    "Open to relocation",
    "Profile completeness %",
    "Checked in",
    "Registered at",
    "Profile URL",
  ];

  const lines = [toCsvRow(HEADERS)];
  for (const r of rows) {
    const c = r.candidate;
    const fa = (r.formAnswers ?? {}) as Record<string, unknown>;
    const edu = c.education[0];
    const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
    lines.push(
      toCsvRow([
        name,
        c.email ?? "",
        c.phone ?? "",
        c.city ?? (typeof fa.currentCityState === "string" ? fa.currentCityState : ""),
        edu?.institution ?? "",
        typeof fa.qualification === "string" ? fa.qualification : edu?.degree ?? "",
        edu?.field ?? "",
        c.graduationYear ?? (typeof fa.graduationYear === "string" ? fa.graduationYear : ""),
        typeof fa.yearOfStudy === "string" ? fa.yearOfStudy : "",
        typeof fa.experienceLevel === "string" ? fa.experienceLevel : "",
        Array.isArray(fa.evDomains) ? (fa.evDomains as string[]).join("; ") : "",
        r.drive.title,
        r.fairMode ?? "",
        r.intendedRoles ?? "",
        r.willingLocations ?? "",
        c.skills.map((s) => s.skill.name).join("; "),
        typeof fa.openToRelocation === "string" ? fa.openToRelocation : "",
        c.profileCompleteness,
        r.checkedInAt ? r.checkedInAt.toISOString() : "",
        r.createdAt.toISOString(),
        c.slug ? `${appUrl}/${c.slug}` : "",
      ]),
    );
  }

  // UTF-8 BOM so Excel opens the file with the right encoding.
  const body = "﻿" + lines.join("\n") + "\n";
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `recruitathon-students-${dateStr}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
