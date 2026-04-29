import { whatsappLink } from "@/lib/whatsapp/link";

/**
 * Single WhatsApp CTA button. Renders only when the candidate has a
 * phone number and the viewing context is allowed to see it (caller
 * decides — we don't repeat the visibility check here, we just trust
 * the parent did it). Mobile devices open the WhatsApp app; desktop
 * opens web.whatsapp.com.
 *
 * Visual: green WhatsApp pill matching the brand's official green
 * (#25D366) so it reads as "WhatsApp" instantly. Icon-only at sm,
 * icon + text at md+.
 */
export function WhatsAppButton({
  phone,
  candidateName,
  recruiterName,
  jobTitle,
  size = "md",
  className,
}: {
  phone: string | null | undefined;
  candidateName: string;
  recruiterName?: string;
  /** When set, mention the role in the prefilled message. */
  jobTitle?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const greeting = `Hi ${candidateName.split(" ")[0]},${
    recruiterName ? ` this is ${recruiterName}` : ""
  }${
    jobTitle ? ` — I'm reaching out about a ${jobTitle} opportunity.` : "."
  }${jobTitle ? "" : " I came across your profile on emobility.careers."}\n\nDo you have a few minutes to chat?`;

  const href = whatsappLink({ phone, text: greeting });
  if (!href) return null;

  const sm = size === "sm";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp ${candidateName}`}
      className={`inline-flex items-center gap-1.5 rounded-md bg-[#25D366] font-bold text-white shadow-sm transition hover:bg-[#1ebe5b] ${
        sm ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"
      } ${className ?? ""}`}
    >
      <WhatsAppIcon className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {sm ? "WhatsApp" : "WhatsApp"}
    </a>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  // Inline SVG (Phosphor-style) — matches the WhatsApp wordmark
  // sufficiently for an inline pill without pulling a new icon dep.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12.04 2C6.6 2 2.18 6.4 2.18 11.84c0 2.07.62 4.06 1.78 5.78L2 22l4.55-1.93a9.83 9.83 0 0 0 5.49 1.66h.01c5.43 0 9.86-4.4 9.86-9.83 0-2.63-1.03-5.1-2.9-6.96A9.83 9.83 0 0 0 12.04 2zm0 17.95a8.18 8.18 0 0 1-4.18-1.14l-.3-.18-3.05 1.3 1.3-2.96-.2-.3a8.16 8.16 0 0 1-1.26-4.83c0-4.5 3.67-8.17 8.18-8.17 2.18 0 4.23.85 5.78 2.4a8.13 8.13 0 0 1 2.4 5.78c0 4.51-3.68 8.18-8.18 8.18zm4.65-6.13c-.25-.13-1.5-.74-1.74-.83-.23-.08-.4-.13-.57.13-.17.25-.66.83-.81.99-.15.17-.3.19-.55.06-.25-.12-1.06-.39-2.02-1.24-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.3.38-.45.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.57-1.36-.78-1.86-.2-.5-.41-.43-.57-.43h-.49c-.17 0-.45.06-.69.32-.24.25-.91.89-.91 2.17 0 1.28.94 2.51 1.07 2.69.13.17 1.85 2.83 4.49 3.97.63.27 1.12.43 1.5.55.63.2 1.21.17 1.66.1.5-.07 1.5-.61 1.71-1.2.21-.59.21-1.09.15-1.2-.06-.1-.23-.16-.48-.29z" />
    </svg>
  );
}
