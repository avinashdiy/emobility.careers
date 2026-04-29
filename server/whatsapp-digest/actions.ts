"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { clientIp, honeypotTriggered } from "@/lib/anti-spam";
import { normalizePhone } from "@/lib/whatsapp/link";
import { sendWhatsAppTemplate } from "@/lib/whatsapp/send";
import { env } from "@/lib/env";
import { ProfileMode, WhatsAppSubscriptionStatus } from "@prisma/client";

/**
 * WhatsApp digest server actions:
 *
 *   • subscribeToDigest   — public, anti-spam. Creates a PENDING row,
 *                           sends a confirmation message via WA, on
 *                           success flips to ACTIVE.
 *   • unsubscribeFromDigest — public via unsubscribe token in every
 *                             digest message. One click = stop.
 *   • cancelDigest         — owner-only "manage subscription" action;
 *                            soft-stops without invalidating tokens.
 */

const subscribeSchema = z.object({
  phone: z.string().min(7).max(20),
  location: z.string().max(80).optional(),
  profileMode: z.nativeEnum(ProfileMode).optional(),
});

export async function subscribeToDigest(formData: FormData): Promise<void> {
  if (honeypotTriggered(formData.get("website"))) {
    redirect("/digest?error=" + encodeURIComponent("Couldn't process this subscription."));
  }

  const ip = await clientIp();
  if (ip) {
    try {
      await rateLimitOrThrow(`digest-ip:${ip}`, "signupIp"); // reuse 5/hour preset
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Too many subscriptions";
      redirect("/digest?error=" + encodeURIComponent(msg));
    }
  }

  // Pull single-value fields via Object.fromEntries; the multi-value
  // evDomainSlugs (one checkbox input per domain) needs formData.getAll().
  const single = Object.fromEntries(formData);
  // Collapse the optional empty `profileMode` so the zod schema doesn't
  // see "" and reject. The native-select uses "" for "Any career stage".
  if (single.profileMode === "") delete (single as Record<string, unknown>).profileMode;
  const parsed = subscribeSchema.safeParse(single);
  if (!parsed.success) {
    redirect("/digest?error=" + encodeURIComponent("Enter a valid 10-digit phone number."));
  }
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    redirect("/digest?error=" + encodeURIComponent("Enter a valid 10-digit phone number."));
  }

  const session = await auth();
  const evDomainSlugs = formData
    .getAll("evDomainSlugs")
    .map((v) => String(v).trim())
    .filter(Boolean);

  // Upsert by unique phone — re-subscribing reactivates a PAUSED /
  // UNSUBSCRIBED entry, never duplicates rows.
  const sub = await db.whatsAppDigestSubscription.upsert({
    where: { phone },
    create: {
      phone,
      userId: session?.user?.id ?? null,
      evDomainSlugs,
      location: parsed.data.location?.trim() || null,
      profileMode: parsed.data.profileMode ?? null,
      status: WhatsAppSubscriptionStatus.PENDING,
      unsubscribeToken: randomUUID(),
    },
    update: {
      // Re-subscribe → reset filters + status, but keep the existing
      // unsubscribeToken so a leaked link still works.
      userId: session?.user?.id ?? null,
      evDomainSlugs,
      location: parsed.data.location?.trim() || null,
      profileMode: parsed.data.profileMode ?? null,
      status: WhatsAppSubscriptionStatus.PENDING,
      failedSendsInARow: 0,
    },
  });

  // Send the confirmation. We use the same template as the daily
  // digest (just with placeholder body params explaining "you're
  // subscribed"), so we don't need a separate confirm template approval.
  // If the template isn't approved yet OR the API key is missing, we
  // STILL flip the status to ACTIVE — operators can verify dry-runs in
  // the admin UI before approving the template in WA Manager.
  const unsubUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/digest/unsubscribe?t=${encodeURIComponent(sub.unsubscribeToken)}`;
  const result = await sendWhatsAppTemplate({
    to: phone,
    templateName: env.WHATSAPP_DIGEST_TEMPLATE,
    bodyParams: [
      "✅ You're subscribed to EV Jobs Daily.",
      "Get 5 fresh EV jobs every morning.",
      "Tailored to your filters.",
      "From emobility.careers.",
      "Tap below to unsubscribe anytime.",
    ],
    urlButtonParam: unsubUrl,
  });

  // Activate the subscription. We accept either real send or a no-op
  // result (Cloud API not configured / template pending) — the worker
  // skips dead numbers naturally via the failure-counter.
  await db.whatsAppDigestSubscription.update({
    where: { id: sub.id },
    data: {
      status: WhatsAppSubscriptionStatus.ACTIVE,
      confirmedAt: new Date(),
    },
  });

  await audit({
    actorId: session?.user?.id ?? null,
    action: "digest.subscribed",
    entity: "WhatsAppDigestSubscription",
    entityId: sub.id,
    meta: { confirmSent: result.ok },
  });

  redirect("/digest?ok=1");
}

export async function unsubscribeFromDigest(token: string): Promise<{ ok: boolean }> {
  if (!token) return { ok: false };
  const sub = await db.whatsAppDigestSubscription.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, phone: true },
  });
  if (!sub) return { ok: false };
  await db.whatsAppDigestSubscription.update({
    where: { id: sub.id },
    data: { status: WhatsAppSubscriptionStatus.UNSUBSCRIBED },
  });
  await audit({
    actorId: null,
    action: "digest.unsubscribed",
    entity: "WhatsAppDigestSubscription",
    entityId: sub.id,
  });
  revalidatePath("/digest");
  return { ok: true };
}
