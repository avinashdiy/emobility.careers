"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";
import { whatsappDigestQueue } from "@/lib/queues";
import { dispatchWhatsAppDigests } from "@/workers/processors/whatsapp-digest";
import { normalizePhone } from "@/lib/whatsapp/link";
import { env } from "@/lib/env";
import { WhatsAppSubscriptionStatus } from "@prisma/client";

/**
 * Admin-only WhatsApp tooling. Wraps the digest subscription model
 * with operator-level controls:
 *
 *   • adminPauseDigest / adminResumeDigest / adminUnsubscribeDigest
 *     — manage subscribers from the admin console without making the
 *       user click their unsubscribe link.
 *   • adminSendTestMessage — fire a one-off template message to verify
 *     the WhatsApp Cloud API + template are wired correctly. The
 *     "ground-truth" check before announcing the digest publicly.
 *   • adminTriggerDigestTick — kick off the digest worker immediately
 *     instead of waiting for the next 30-minute repeat.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const subIdSchema = z.object({ id: z.string() });

export async function adminPauseDigest(formData: FormData) {
  const session = await requireAdmin();
  const { id } = subIdSchema.parse(Object.fromEntries(formData));
  await db.whatsAppDigestSubscription.update({
    where: { id },
    data: { status: WhatsAppSubscriptionStatus.PAUSED },
  });
  await audit({
    actorId: session.user.id,
    action: "digest.admin_paused",
    entity: "WhatsAppDigestSubscription",
    entityId: id,
  });
  revalidatePath("/admin/whatsapp");
}

export async function adminResumeDigest(formData: FormData) {
  const session = await requireAdmin();
  const { id } = subIdSchema.parse(Object.fromEntries(formData));
  await db.whatsAppDigestSubscription.update({
    where: { id },
    data: {
      status: WhatsAppSubscriptionStatus.ACTIVE,
      // Resuming clears the auto-pause counter so the worker doesn't
      // immediately re-pause on the next legitimate failure.
      failedSendsInARow: 0,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "digest.admin_resumed",
    entity: "WhatsAppDigestSubscription",
    entityId: id,
  });
  revalidatePath("/admin/whatsapp");
}

export async function adminUnsubscribeDigest(formData: FormData) {
  const session = await requireAdmin();
  const { id } = subIdSchema.parse(Object.fromEntries(formData));
  await db.whatsAppDigestSubscription.update({
    where: { id },
    data: { status: WhatsAppSubscriptionStatus.UNSUBSCRIBED },
  });
  await audit({
    actorId: session.user.id,
    action: "digest.admin_unsubscribed",
    entity: "WhatsAppDigestSubscription",
    entityId: id,
  });
  revalidatePath("/admin/whatsapp");
}

const testSchema = z.object({
  phone: z.string().min(7).max(20),
});

/**
 * Send a test template message to a recruiter-supplied number. The body
 * params are deterministic placeholders so an admin can verify the
 * template formatting without polluting real subscribers' history.
 *
 * Always redirects with a success / error notice so the result is
 * visible in the URL after the form submits — nothing is silent.
 */
export async function adminSendTestMessage(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = testSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/whatsapp?error=" + encodeURIComponent("Invalid phone number."));
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    redirect("/admin/whatsapp?error=" + encodeURIComponent("Invalid phone number."));
  }

  const result = await sendWhatsAppTemplate({
    to: phone,
    templateName: env.WHATSAPP_DIGEST_TEMPLATE,
    bodyParams: [
      "✅ Test message from emobility.careers admin",
      "Battery Engineer · Acme EV · Bengaluru · ₹12-22L",
      "BMS Lead · Powertrain Co · Pune · ₹18-30L",
      "Charging Infra Manager · CMS Co · Delhi · ₹14-24L",
      "Tap below to unsubscribe — this is a TEST.",
    ],
    urlButtonParam: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/digest`,
  });

  if (result.ok) {
    redirect(
      "/admin/whatsapp?notice=" +
        encodeURIComponent(
          `✅ Sent test to ${phone}. Message id: ${result.messageId ?? "—"}`,
        ),
    );
  }
  redirect(
    "/admin/whatsapp?error=" +
      encodeURIComponent(
        `Send failed: ${result.errorMessage ?? "unknown"} ${result.errorCode ? `(code ${result.errorCode})` : ""}`,
      ),
  );
}

/**
 * Force an immediate digest dispatch, ignoring the 30-minute repeat
 * schedule. Useful when admin wants to push a fresh run after a manual
 * tweak (e.g. a new template approval, or after toggling a stuck
 * subscription back to ACTIVE).
 *
 * Runs the same `dispatchWhatsAppDigests` the worker calls — same
 * dedupe rules apply (only ACTIVE subs whose lastSentAt < today).
 */
export async function adminTriggerDigestTick(): Promise<void> {
  const session = await requireAdmin();
  const result = await dispatchWhatsAppDigests();
  await audit({
    actorId: session.user.id,
    action: "digest.admin_triggered",
    entity: "User",
    entityId: session.user.id,
    meta: result,
  });
  redirect(
    "/admin/whatsapp?notice=" +
      encodeURIComponent(
        `Tick run: ${result.sent} sent · ${result.failed} failed · ${result.paused} auto-paused.`,
      ),
  );
}

// Suppress unused-import lint when the queue isn't called directly from
// this module today — kept exported for future "schedule for X time"
// admin actions.
void whatsappDigestQueue;
