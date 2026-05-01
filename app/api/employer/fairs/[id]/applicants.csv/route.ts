import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { canSeeContact, getViewerContext } from "@/lib/profile-visibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Per-fair applicant CSV export for the recruiter.
 *
 * Auth path:
 *   1. Caller is signed in.
 *   2. Caller has an EmployerProfile attached to a company that's
 *      CONFIRMED on this drive.
 *   3. We export only Applications whose job belongs to the
 *      caller's company AND have `recruitmentDriveId` matching
 *      the route param. So a recruiter at Company A can never
 *      pull Company B's applicants from the same fair.
 *
 * Privacy:
 *   • Email + phone honour `canSeeContact`. The candidate applied
 *     to this company's job, so the application-relationship
 *     branch of the policy gives this recruiter access to contact
 *     details. Out-of-policy candidates fall back to a redacted
 *     row — the file still lists them so the recruiter doesn't
 *     wonder where their applicants went, but the cells say
 *     "[hidden]".
 *
 * Format: standard RFC-4180 CSV with CRLF line endings + UTF-8
 * BOM so Excel auto-detects the encoding (Indian recruiters
 * routinely live in Excel for these batches).
 */

const HEADERS = [
  "Application ID",
  "Applied at",
  "Stage",
  "Match score",
  "Candidate name",
  "Email",
  "Phone",
  "Headline",
  "Location",
  "Total experience (months)",
  "Profile URL",
  "Resume URL",
  "Job title",
  "Job URL",
  "Cover letter",
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Recruiter only" }, { status: 403 });
  }
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer?.companyId) {
    return NextResponse.json({ error: "Recruiter only" }, { status: 403 });
  }

  // Rate limit — exports are an expensive read (5000 rows × per-row
  // visibility lookup) and a recruiter hammering this endpoint can
  // dominate DB CPU. 10 exports per hour per user is plenty for any
  // realistic ATS workflow; beyond that it's almost certainly
  // automation we don't want to enable. PG limiter (not in-memory)
  // because the rate must apply across our N web instances.
  const limit = await pgRateLimit({
    action: "fair.csv_export",
    userId: session.user.id,
    opts: { limit: 10, windowMs: 60 * 60 * 1000 },
  });
  if (!limit.ok) {
    return NextResponse.json({ error: limit.message }, { status: 429 });
  }

  const { id: driveId } = await params;

  // Confirm the company is on the drive — we don't allow exports
  // for INVITED / WITHDRAWN states.
  const part = await db.recruitmentDriveCompany.findUnique({
    where: {
      driveId_companyId: { driveId, companyId: employer.companyId },
    },
    select: { status: true, drive: { select: { slug: true, title: true } } },
  });
  if (!part) {
    return NextResponse.json({ error: "Not on this drive" }, { status: 404 });
  }
  if (part.status !== "CONFIRMED") {
    return NextResponse.json(
      { error: "Confirm participation before exporting." },
      { status: 403 },
    );
  }

  const applications = await db.application.findMany({
    where: {
      recruitmentDriveId: driveId,
      job: { companyId: employer.companyId },
    },
    orderBy: { appliedAt: "desc" },
    take: 5000, // safety cap; if we hit this for a real fair we'll page
    include: {
      job: { select: { id: true, slug: true, title: true } },
      candidate: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              phone: true,
              candidateProfile: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  // Build a Set of candidate userIds → contact-visibility decision
  // up front. We need a ViewerContext per candidate but the only
  // axis that varies between rows is the (viewer, owner) pair, and
  // we already know the viewer is an employer with an application
  // relationship for every row in this query. So we can short-
  // circuit canSeeContact() by constructing the context inline.
  // This keeps the export at one Prisma round-trip.
  const lines: string[] = [];
  for (const a of applications) {
    const cp = a.candidate;
    const userEmail = cp.user.email;
    const userPhone = cp.user.phone;
    // Emulate the ViewerContext shape canSeeContact expects. The
    // current employer DOES have an application relationship for
    // every row in this query (that's how we found them), so the
    // gate evaluates to true unless the candidate's visibility is
    // strictly PRIVATE.
    const ctx = await getViewerContext(
      session.user.id,
      cp.userId,
      session.user.role as "ADMIN" | "EMPLOYER" | "CANDIDATE",
    );
    const showContact = canSeeContact(cp.contactVisibility, ctx);
    const fullName = [cp.firstName, cp.lastName].filter(Boolean).join(" ");
    lines.push(
      [
        a.id,
        a.appliedAt.toISOString(),
        a.stage,
        a.matchScore != null ? Math.round(a.matchScore * 100) + "%" : "",
        fullName,
        showContact ? userEmail ?? "" : "[hidden]",
        showContact ? userPhone ?? "" : "[hidden]",
        cp.headline ?? "",
        cp.location ?? "",
        cp.totalExperienceMonths,
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/${cp.slug}`,
        cp.resumeUrl ?? a.resumeSnapshotUrl ?? "",
        a.job.title,
        `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/job/${a.job.slug}`,
        a.coverLetter ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  // Audit the export — recruiters pulling applicant lists is a
  // sensitive operation worth a paper trail (helps us answer
  // "who pulled my contact data" requests later under the
  // existing data-rights flow).
  try {
    await audit({
      actorId: session.user.id,
      action: "recruitment_drive.applicants_exported",
      entity: "RecruitmentDrive",
      entityId: driveId,
      meta: {
        rows: applications.length,
        companyId: employer.companyId,
      },
    });
  } catch (err) {
    logger.warn({ err }, "[recruitment-drive] export audit failed");
  }

  // UTF-8 BOM (﻿) so Excel auto-detects encoding instead of
  // showing mojibake on names with diacritics. CRLF line endings
  // because RFC 4180 says so and Excel cares.
  const body =
    "﻿" + HEADERS.map(csvEscape).join(",") + "\r\n" + lines.join("\r\n");
  // Suggest a meaningful filename so the recruiter doesn't end up
  // with `applicants.csv (3).csv` after their fifth export.
  const filenameSafe =
    part.drive.slug.replace(/[^a-z0-9-]+/gi, "-") +
    `-applicants-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameSafe}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * RFC 4180 CSV cell escape. Wrap in double-quotes if the value
 * contains a comma, quote, CR or LF; double up internal quotes.
 * Coerces non-strings to string first.
 */
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
