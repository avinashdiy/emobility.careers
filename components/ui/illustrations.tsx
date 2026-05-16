/**
 * V2 polish — inline-SVG illustrations for EmptyState's new
 * `illustration` slot. Single-stroke line art in the brand palette so
 * each one feels lighter than a stock-photo emoji + reads as part of
 * the design system rather than dropped clipart.
 *
 * Conventions:
 *   • 160x120 viewBox (4:3) — sits comfortably above the title without
 *     dominating the card.
 *   • Stroke: emce-mid, 1.5px, no fill (or very subtle fill at 10% opacity).
 *   • Two-color max — primary stroke + a single accent dot/star.
 *   • Dark mode: emce-mid reads fine on dark surfaces too, so no
 *     conditional needed.
 *
 * Add new ones here when a new empty surface lands; keep them small
 * and silent — the goal is "a friendly nudge" not "look at this art".
 */

interface IllusProps {
  className?: string;
}

const DEFAULT_CLS = "h-28 w-40 text-emce-mid";

export function NoJobsIllustration({ className = DEFAULT_CLS }: IllusProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Job-listing card */}
      <rect x="36" y="22" width="76" height="60" rx="6" />
      <line x1="46" y1="38" x2="80" y2="38" />
      <line x1="46" y1="48" x2="92" y2="48" />
      <line x1="46" y1="58" x2="74" y2="58" />
      <rect x="46" y="66" width="18" height="8" rx="3" />
      <rect x="68" y="66" width="22" height="8" rx="3" />
      {/* Magnifying glass on top-right */}
      <circle cx="118" cy="76" r="14" />
      <line x1="129" y1="87" x2="138" y2="96" />
      {/* Accent dot */}
      <circle cx="128" cy="42" r="2" className="text-emce-light fill-current" stroke="none" />
    </svg>
  );
}

export function NoCandidatesIllustration({ className = DEFAULT_CLS }: IllusProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Three pipeline columns */}
      <rect x="14" y="20" width="38" height="84" rx="4" />
      <rect x="61" y="20" width="38" height="84" rx="4" />
      <rect x="108" y="20" width="38" height="84" rx="4" />
      <line x1="14" y1="34" x2="52" y2="34" />
      <line x1="61" y1="34" x2="99" y2="34" />
      <line x1="108" y1="34" x2="146" y2="34" />
      {/* One placeholder avatar drifting into the first column */}
      <circle cx="33" cy="58" r="6" />
      <path d="M22 78 Q33 68 44 78" />
      {/* Subtle "+" star above the rightmost column */}
      <path d="M127 12 v6 M124 15 h6" className="text-emce-light" />
    </svg>
  );
}

export function NoMessagesIllustration({ className = DEFAULT_CLS }: IllusProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Speech bubble */}
      <path d="M24 30 h80 a10 10 0 0 1 10 10 v30 a10 10 0 0 1 -10 10 h-46 l-18 14 v-14 h-16 a10 10 0 0 1 -10 -10 v-30 a10 10 0 0 1 10 -10 z" />
      <circle cx="56" cy="55" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="68" cy="55" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="80" cy="55" r="2.5" fill="currentColor" stroke="none" />
      {/* Accent — a tiny reply bubble in the corner */}
      <path d="M120 18 h22 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-10 l-6 6 v-6 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 z" className="text-emce-light" />
    </svg>
  );
}

export function NoAutomationsIllustration({ className = DEFAULT_CLS }: IllusProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Big gear */}
      <circle cx="62" cy="62" r="22" />
      <circle cx="62" cy="62" r="6" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 62 + Math.cos(rad) * 22;
        const y1 = 62 + Math.sin(rad) * 22;
        const x2 = 62 + Math.cos(rad) * 30;
        const y2 = 62 + Math.sin(rad) * 30;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {/* Small gear */}
      <circle cx="116" cy="40" r="12" />
      <circle cx="116" cy="40" r="3" />
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 116 + Math.cos(rad) * 12;
        const y1 = 40 + Math.sin(rad) * 12;
        const x2 = 116 + Math.cos(rad) * 17;
        const y2 = 40 + Math.sin(rad) * 17;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {/* Sparkle */}
      <path d="M132 86 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z" className="text-emce-light fill-current" stroke="none" />
    </svg>
  );
}

export function NoBadgesIllustration({ className = DEFAULT_CLS }: IllusProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Shield */}
      <path d="M80 18 L46 30 v30 c0 22 14 38 34 44 c20 -6 34 -22 34 -44 V30 z" />
      {/* Check inside */}
      <path d="M64 60 L74 70 L96 48" />
      {/* Sparkle */}
      <path d="M122 22 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2 z" className="text-emce-light fill-current" stroke="none" />
    </svg>
  );
}
