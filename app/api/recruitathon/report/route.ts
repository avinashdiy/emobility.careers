import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GENERAL_EV_SLUG } from "@/lib/recruitathon/exam-config";
import { renderRecruitathonReportPdf, type ReportJd, type ReportResult, type AttemptStatus } from "@/lib/pdf/recruitathon-report";

/**
 * Candidate-facing PDF report of their Recruitathon results — general EV
 * score + a card per selected role (AI match, test score, pass/fail).
 * Node runtime (pdfkit needs Node); auth-gated to the signed-in candidate.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusOf(attempt: { submittedAt: Date | null } | null | undefined): AttemptStatus {
  if (!attempt) return "not_started";
  return attempt.submittedAt ? "done" : "in_progress";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.redirect(new URL("/signin", process.env.NEXT_PUBLIC_APP_URL ?? "https://emobility.careers"));

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true, firstName: true, lastName: true, headline: true, phone: true,
      city: true, country: true, location: true,
      user: { select: { email: true } },
    },
  });
  if (!profile) return new Response("No profile", { status: 404 });

  const selections = await db.recruitathonJdSelection.findMany({
    where: { candidateId: profile.id },
    orderBy: { createdAt: "asc" },
    select: {
      matchScore: true,
      jd: {
        select: {
          company: true, role: true, level: true,
          assessment: { select: { id: true, passingScore: true } },
        },
      },
    },
  });

  // General EV assessment + this candidate's latest attempt.
  const general = await db.assessment.findFirst({
    where: { skillMeta: { slug: GENERAL_EV_SLUG } },
    select: { id: true, passingScore: true },
  });

  const assessmentIds = [
    ...selections.map((s) => s.jd.assessment?.id).filter((v): v is string => Boolean(v)),
    ...(general ? [general.id] : []),
  ];
  const attempts = assessmentIds.length
    ? await db.assessmentAttempt.findMany({
        where: { candidateId: profile.id, assessmentId: { in: assessmentIds } },
        orderBy: { startedAt: "desc" },
        select: { assessmentId: true, score: true, passed: true, submittedAt: true },
      })
    : [];
  // Latest attempt per assessment (findMany is ordered desc, so first wins).
  const attemptByAssessment = new Map<string, (typeof attempts)[number]>();
  for (const a of attempts) if (!attemptByAssessment.has(a.assessmentId)) attemptByAssessment.set(a.assessmentId, a);

  const generalRes: ReportResult | null = general
    ? (() => {
        const at = attemptByAssessment.get(general.id);
        return { score: at?.submittedAt ? at.score ?? null : null, passed: at?.submittedAt ? at.passed ?? null : null, status: statusOf(at), passMark: general.passingScore };
      })()
    : null;

  const jds: ReportJd[] = selections.map((s) => {
    const aId = s.jd.assessment?.id;
    const at = aId ? attemptByAssessment.get(aId) : undefined;
    return {
      company: s.jd.company,
      role: s.jd.role,
      level: s.jd.level,
      matchScore: s.matchScore,
      score: at?.submittedAt ? at.score ?? null : null,
      passed: at?.submittedAt ? at.passed ?? null : null,
      status: statusOf(at),
      passMark: s.jd.assessment?.passingScore ?? 50,
    };
  });

  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Candidate";
  const pdf = await renderRecruitathonReportPdf({
    name,
    headline: profile.headline,
    email: profile.user?.email ?? null,
    phone: profile.phone,
    location: [profile.city, profile.country].filter(Boolean).join(", ") || profile.location,
    general: generalRes,
    jds,
    generatedAt: new Date(),
  });

  const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "candidate";
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recruitathon-report-${safe}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
