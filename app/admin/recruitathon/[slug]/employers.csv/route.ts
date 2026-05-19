/**
 * CSV export of every employer registered for a recruitment drive.
 * Mirror of the candidates CSV — same plumbing (auth, BOM, escape
 * rules) — column set reflects the placement-team's employer
 * questionnaire.
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

  const rows = await db.recruitmentDriveCompany.findMany({
    where: { driveId: drive.id },
    orderBy: { invitedAt: "asc" },
    select: {
      status: true, invitedAt: true, confirmedAt: true, boothLabel: true,
      aboutAtFair: true, fairMode: true, hiresFreshers: true,
      providesTraining: true, growthOpportunities: true, pocPhone: true,
      formAnswers: true,
      company: {
        select: {
          name: true, website: true, verificationStatus: true, about: true,
          team: {
            where: { isCompanyAdmin: true },
            take: 1,
            select: {
              designation: true,
              user: { select: { name: true, email: true, emailVerifiedAt: true } },
            },
          },
        },
      },
    },
  });

  const header = [
    "Company name",
    "Industry / domain",
    "Website",
    "Products / services",
    "Hiring locations",
    "Open roles + headcount",
    "Skills wanted",
    "Hires freshers",
    "Provides training",
    "Growth opportunities",
    "Fair mode",
    "POC name",
    "POC designation",
    "POC email",
    "POC email verified",
    "POC phone",
    "Company verification status",
    "Booth label",
    "Participation status",
    "Confirmed at",
    "Registered at",
  ];

  const lines: string[] = [toCsvRow(header)];
  for (const p of rows) {
    const c = p.company;
    const fa = (p.formAnswers ?? {}) as Record<string, unknown>;
    const admin = c.team[0];
    lines.push(
      toCsvRow([
        c.name,
        String(fa.industry ?? ""),
        c.website ?? "",
        String(fa.productsServices ?? c.about ?? ""),
        String(fa.hiringLocations ?? ""),
        p.aboutAtFair ?? "",
        String(fa.desiredSkills ?? ""),
        p.hiresFreshers ? "Yes" : "No",
        p.providesTraining ? "Yes" : "No",
        p.growthOpportunities ?? "",
        p.fairMode ?? "",
        admin?.user.name ?? "",
        admin?.designation ?? "",
        admin?.user.email ?? "",
        admin?.user.emailVerifiedAt ? "Yes" : "No",
        p.pocPhone ?? "",
        c.verificationStatus,
        p.boothLabel ?? "",
        p.status,
        p.confirmedAt ? p.confirmedAt.toISOString() : "",
        p.invitedAt.toISOString(),
      ]),
    );
  }

  const body = "﻿" + lines.join("\n") + "\n";
  const filename = `recruitathon-employers-${drive.slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
