import { NextResponse, type NextRequest } from "next/server";
import { finalizeRecruitathonAttempt } from "@/server/recruitathon/exam-actions";
import { logger } from "@/lib/logger";

/**
 * Stable submit endpoint for the Recruitathon proctored exam.
 *
 * The exam runner posts here instead of invoking the `submitExam` server
 * action directly, because a server action is addressed by a build-hashed
 * id that changes on every deploy — a candidate who loaded the exam on an
 * older build then tapped Submit hit "Failed to find Server Action" and the
 * global 500 page, losing their submission. A route URL is stable across
 * deploys, so submit keeps working through a mid-exam deploy.
 *
 * finalizeRecruitathonAttempt does its own session + ownership check.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Cross-site POST guard — the plain route lacks the server action's built-in
  // origin check, so mirror it: same-origin fetches send `sec-fetch-site:
  // same-origin`. Reject anything explicitly cross-site. (Ownership is still
  // enforced downstream in loadOwnedAttempt; this just closes CSRF.)
  const sfs = req.headers.get("sec-fetch-site");
  if (sfs && sfs !== "same-origin" && sfs !== "same-site" && sfs !== "none") {
    return NextResponse.json({ ok: false, error: "bad_origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = (body ?? {}) as { attemptId?: unknown; answersJson?: unknown; reason?: unknown };
  const attemptId = typeof b.attemptId === "string" ? b.attemptId : "";
  if (!attemptId) return NextResponse.json({ ok: false, error: "missing_attempt" }, { status: 400 });
  const answersJson = typeof b.answersJson === "string" ? b.answersJson : "";
  const reason = typeof b.reason === "string" ? b.reason : "manual";

  try {
    const res = await finalizeRecruitathonAttempt(attemptId, answersJson, reason);
    if (!res.ok || !res.resultUrl) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, resultUrl: res.resultUrl });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), attemptId }, "[recruitathon-exam] submit route failed");
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
