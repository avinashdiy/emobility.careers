import { NextResponse } from "next/server";
import type { Prisma, CallingSessionStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * #16 Calling provider webhook.
 *
 * Receives call-status events from the active calling provider. For
 * Exotel: their POST hits this with form-encoded fields including
 * CallSid, Status (in-progress / completed / failed / busy /
 * no-answer), RecordingUrl, RecordingDuration. We update the matching
 * CallingSession row by `providerCallSid`.
 *
 * Production hardening needed before going live:
 *   - HMAC signature verification (Exotel sends an X-Exotel-Signature
 *     header derived from the configured account token; reject any
 *     request whose signature doesn't match).
 *   - Idempotency cache (BullMQ retries can replay the same event;
 *     ignore duplicate StatusCallback for the same CallSid + Status).
 *   - ASR pipeline — fetch the recording URL, send to OpenAI Whisper
 *     transcription with `language` hint matching the session's
 *     CallingLanguage, then trigger scoreCallingSession with the
 *     resulting transcript.
 *
 * For now we accept the webhook, log it, and update status. The
 * "Score this transcript" admin UI handles the AI scoring path
 * manually until the ASR plumbing lands.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const body =
      contentType.includes("application/json")
        ? (await request.json()) as Record<string, string>
        : Object.fromEntries((await request.formData()).entries()) as Record<string, string>;

    const callSid = body.CallSid ?? body.callSid ?? body.sid;
    const status = (body.Status ?? body.status ?? "").toLowerCase();

    if (!callSid) {
      return NextResponse.json({ ok: false, reason: "missing-callsid" }, { status: 400 });
    }

    const next: CallingSessionStatus =
      status === "in-progress" || status === "in_progress" ? "IN_PROGRESS"
      : status === "completed" ? "COMPLETED"
      : status === "busy" || status === "no-answer" || status === "failed" ? "FAILED"
      : status === "canceled" || status === "cancelled" ? "CANCELLED"
      : "DIALING";

    const update: Prisma.CallingSessionUpdateInput = { status: next };
    if (next === "COMPLETED") update.completedAt = new Date();
    if (next === "FAILED") update.errorMessage = `Provider status: ${status}`;

    await db.callingSession.updateMany({
      where: { providerCallSid: callSid },
      data: update,
    });

    logger.info({ provider, callSid, status, next }, "[calling.webhook] processed");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error({ err, provider }, "[calling.webhook] handler failed");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
