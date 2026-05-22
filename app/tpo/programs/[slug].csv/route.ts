import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getDriveStudentReport } from "@/lib/tpo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV export of a TPO's per-drive student participation report.
 *
 * Why this exists: HR head Shivani's specific request — TPOs need a
 * downloadable "participation report" they can share with college
 * leadership / managers / cohort heads. The web table at
 * `/tpo/programs/[slug]` is the live view; this endpoint is the
 * "give me a file" path that produces an Excel-friendly CSV with
 * one row per student per (course + drive).
 *
 * Auth: same gate as the TPO console — ADMIN role OR
 * `User.isPlacementOfficer = true`. No leakage of one TPO's cohort
 * to another since the cohort filter (?cohort=slug) is the only
 * narrowing dimension and admins / TPOs both have legitimate access
 * to their cohort's data.
 *
 * Columns chosen for Excel-friendliness:
 *   first_name, last_name, email, course, registered, checked_in,
 *   applications_count, furthest_stage, per_job_summary
 *
 * `per_job_summary` is a compact "TITLE @ COMPANY [STAGE]; …" string
 * so a single row carries every application + stage without forcing
 * multi-row-per-student output that breaks Excel pivoting.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Auth gate — same as the TPO layout.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true },
  });
  if (!user || (user.role !== "ADMIN" && !user.isPlacementOfficer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const cohortSlug = req.nextUrl.searchParams.get("cohort");
  const cohort = cohortSlug
    ? await db.cohort.findUnique({
        where: { slug: cohortSlug },
        select: { id: true, name: true },
      })
    : null;
  const cohortId = cohort?.id ?? null;

  const report = await getDriveStudentReport(cohortId, slug);
  if (!report) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  // Build one row per student. Per-job detail rolls into a single
  // semicolon-separated column so Excel users can paste-and-pivot
  // without dealing with multi-row records per student.
  const csvRows = report.students.map((s) => ({
    first_name: s.firstName,
    last_name: s.lastName ?? "",
    email: s.email ?? "",
    course: s.course ?? "",
    registered: s.registered ? "Yes" : "No",
    checked_in: s.checkedIn ? "Yes" : "No",
    applications_count: s.applicationsCount,
    furthest_stage: s.furthestStage ?? "Not applied",
    per_job_summary:
      s.perJob.length === 0
        ? ""
        : s.perJob
            .map((j) => `${j.jobTitle} @ ${j.companyName} [${j.stage}]`)
            .join("; "),
    profile_url: `https://emobility.careers/${s.slug}`,
  }));

  const csv = Papa.unparse(csvRows);
  // Sanitise the drive title for the filename — Excel + most OSes
  // reject filenames with `/`, `:`, etc. Slug is already safe.
  const cohortPart = cohort ? `--${cohortSlug}` : "";
  const filename = `program-${report.drive.slug}${cohortPart}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
