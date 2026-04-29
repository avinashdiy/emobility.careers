import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { notificationsQueue } from "@/lib/queues";

/**
 * Razorpay webhook listener.
 *
 * Configure in Razorpay dashboard with the URL:
 *   https://emobility.careers/api/payments/razorpay/webhook
 * and the events:
 *   - payment.captured
 *   - payment.failed
 *   - refund.processed
 *
 * The mentee-side Checkout success handler also calls the
 * `confirmMentorshipPayment` server action — this webhook is the safety net
 * that flips a session to CONFIRMED if the user closes the browser before
 * the verify call lands.
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = (await headers()).get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) {
    logger.warn({ path: "/api/payments/razorpay/webhook" }, "[razorpay-webhook] bad signature");
    return new NextResponse("invalid signature", { status: 400 });
  }
  let parsed: { event: string; payload: { payment?: { entity: { id: string; order_id: string; status: string } }; refund?: { entity: { payment_id: string; status: string } } } };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const event = parsed.event;

  if (event === "payment.captured" && parsed.payload.payment) {
    const p = parsed.payload.payment.entity;
    const sessionRow = await db.mentorshipSession.findUnique({ where: { razorpayOrderId: p.order_id } });
    if (sessionRow && sessionRow.paymentStatus !== "PAID") {
      await db.mentorshipSession.update({
        where: { id: sessionRow.id },
        data: { paymentStatus: "PAID", status: "CONFIRMED", razorpayPaymentId: p.id },
      });
      const mentor = await db.mentorProfile.findUnique({ where: { id: sessionRow.mentorId }, select: { userId: true } });
      if (mentor) {
        await notificationsQueue.add("mentorship.webhook-confirmed", {
          userId: mentor.userId,
          type: "mentorship.booking-confirmed",
          title: "New mentorship session booked (paid)",
          body: sessionRow.topic.slice(0, 80),
          link: "/me/mentor/sessions",
        });
      }
    }
  } else if (event === "payment.failed" && parsed.payload.payment) {
    const p = parsed.payload.payment.entity;
    const sessionRow = await db.mentorshipSession.findUnique({ where: { razorpayOrderId: p.order_id } });
    if (sessionRow && sessionRow.status === "PENDING_PAYMENT") {
      await db.mentorshipSession.update({
        where: { id: sessionRow.id },
        data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date() },
      });
    }
  } else if (event === "refund.processed" && parsed.payload.refund) {
    const r = parsed.payload.refund.entity;
    const sessionRow = await db.mentorshipSession.findFirst({ where: { razorpayPaymentId: r.payment_id } });
    if (sessionRow) {
      await db.mentorshipSession.update({
        where: { id: sessionRow.id },
        data: { paymentStatus: "REFUNDED", refundAt: new Date() },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
