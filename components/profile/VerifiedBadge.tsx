/**
 * Twitter-style blue verified-account checkmark. Distinct from:
 *   • DIYguru ⭐ badge   (course-completion, gold)
 *   • Email/phone tick   (channel verification, plain)
 *   • Company verified   (employer-side KYC, separate component)
 *
 * Rendered next to the candidate's name on:
 *   • Public profile header (/[username])
 *   • Self-edit profile (/me/profile)
 *   • Feed post cards + comments
 *   • Search result rows
 *   • Application kanban cards (so recruiters can spot verified candidates)
 *
 * Implementation note: we draw the SVG inline rather than pulling from
 * lucide because lucide doesn't ship the Twitter "starburst-with-tick"
 * shape. The path is the official 8-pointed-star outline (24px viewbox)
 * with a centred check; rendering at any size is crisp because it's
 * vector. Color is locked to Twitter's `#1d9bf0` blue — universally
 * read as "verified person".
 */
export function VerifiedBadge({
  size = 14,
  className,
  withTooltip = true,
}: {
  size?: number;
  className?: string;
  withTooltip?: boolean;
}) {
  const dim = `${size}px`;
  return (
    <span
      className={`inline-flex shrink-0 align-baseline ${className ?? ""}`}
      title={withTooltip ? "Verified by eMobility Careers" : undefined}
      aria-label="Verified profile"
    >
      <svg
        viewBox="0 0 24 24"
        width={dim}
        height={dim}
        aria-hidden
        style={{ display: "block" }}
      >
        <path
          fill="#1d9bf0"
          d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
        />
        <path
          fill="#fff"
          d="m9.71 13.7-2.39-2.39a1 1 0 0 1 1.41-1.41l1.69 1.68 4.59-4.58a1 1 0 0 1 1.41 1.41L11.12 13.7a1 1 0 0 1-1.41 0z"
        />
      </svg>
    </span>
  );
}
