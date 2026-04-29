/**
 * Razorpay Orders API client + webhook signature verification.
 *
 * Why a tiny custom client and not the official `razorpay` npm package?
 * The official package is CommonJS-heavy and pulls in `request@2`, which
 * Next.js bundles with deprecation warnings. We only need three operations:
 *   1) Create an Order (returns `id` we hand to the Razorpay Checkout JS)
 *   2) Verify the checkout signature on success (HMAC-SHA256)
 *   3) Verify webhook signatures (HMAC-SHA256 over raw body)
 *
 * Docs:
 *   https://razorpay.com/docs/payments/server-integration/nodejs/install/
 *   https://razorpay.com/docs/webhooks/validate-test/
 *
 * If RAZORPAY_KEY_ID is unset (dev / staging without payments) the helpers
 * return a stub `id` and skip verification so booking flows still work end
 * to end without a live Razorpay account.
 */

import crypto from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export interface RazorpayOrderInput {
  amountMinor: number;       // e.g. paise for INR
  currency: string;          // ISO 4217
  receipt: string;           // our internal session/registration id
  notes?: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export const RAZORPAY_PUBLIC_KEY_ID = env.RAZORPAY_KEY_ID ?? "";

export async function createRazorpayOrder(input: RazorpayOrderInput): Promise<RazorpayOrder> {
  if (!isRazorpayConfigured()) {
    const stubId = `order_stub_${crypto.randomBytes(8).toString("hex")}`;
    logger.warn({ stubId, receipt: input.receipt }, "[razorpay] not configured — using stub order id");
    return { id: stubId, status: "created", amount: input.amountMinor, currency: input.currency };
  }
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountMinor,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
      payment_capture: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay order create failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as RazorpayOrder;
  return json;
}

/**
 * Verify the signature returned to the browser by the Razorpay Checkout. The
 * payload is `${order_id}|${payment_id}` and the secret is the API key secret.
 */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!isRazorpayConfigured()) return true; // dev stub passes through
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Verify a webhook delivery. Razorpay signs with RAZORPAY_WEBHOOK_SECRET (NOT
 * the API key). The signature lives in the `X-Razorpay-Signature` header.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    logger.warn("[razorpay] webhook secret not set — accepting payload (dev only)");
    return true;
  }
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
