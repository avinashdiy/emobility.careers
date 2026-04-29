/**
 * Build a `wa.me` deep-link that opens a chat with a candidate.
 *
 * Why deep-link, not Cloud-API send: the recruiter using this is a
 * human (typically on mobile) wanting to start a personal conversation
 * — they're not blasting templated messages. `wa.me/<intl>?text=…` opens
 * the recruiter's own WhatsApp app on mobile, or web.whatsapp.com on
 * desktop, with the body pre-filled. The candidate sees it as if the
 * recruiter messaged them directly.
 *
 * Cloud-API/template sends require Meta business-tier setup + opt-in
 * audit and don't fit cold-recruiter outreach. We keep that path open
 * via `WHATSAPP_PHONE_NUMBER_ID` env for *application-related* notifs
 * (interview reminders, offer received) but not for ad-hoc HR contact.
 */

/**
 * Strip everything but digits + leading `+`. Real candidate phone
 * numbers in this dataset come from MSG91 OTP onboarding so they're
 * E.164-clean, but legacy WordPress imports can have spaces, hyphens,
 * brackets — normalise so `wa.me` accepts the URL.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  // Drop a leading "+" then digits-only.
  const hasPlus = s.startsWith("+");
  s = s.replace(/[^\d]/g, "");
  if (!s) return null;
  // wa.me wants no plus, no leading zeros for international dialing.
  // If the number doesn't start with a country code (heuristic: <11
  // digits) and our app is India-default, prefix 91. This matches
  // emobility.careers' India-first onboarding (MSG91 OTP, INR currency).
  if (!hasPlus && s.length === 10) s = `91${s}`;
  return s;
}

/**
 * Compose a `https://wa.me/<intl>?text=<encoded>` URL ready to put on
 * an `<a href>` or to open programmatically. Returns null when the
 * phone is empty or non-numeric so callers can short-circuit the CTA
 * without rendering a broken link.
 */
export function whatsappLink(opts: {
  phone: string | null | undefined;
  text?: string;
}): string | null {
  const num = normalizePhone(opts.phone);
  if (!num) return null;
  const url = new URL(`https://wa.me/${num}`);
  if (opts.text) url.searchParams.set("text", opts.text);
  return url.toString();
}
