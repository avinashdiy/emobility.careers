import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * LinkedIn-style "#OpenToWork" green ring + chip overlay. Renders
   * only when `openToWork` is true *and* size is "md" or larger — at
   * "sm" the chip obscures the avatar, so we silently drop it on small
   * renders. Mutually exclusive with `hiring` (the editor enforces
   * exactly one of the two at server-action save time).
   */
  openToWork?: boolean;
  /**
   * "#Hiring" frame for users who are recruiting. Same chip + ring
   * pattern as `openToWork` but in a contrasting dark-teal palette so
   * the two roles read distinctly at a glance. If both flags are
   * accidentally set, hiring wins (the more deliberate signal).
   */
  hiring?: boolean;
}

const sizeMap = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
};

// Chip sizing — kept proportional to the avatar disc so the chip always
// reads as a "stamp" on the avatar rather than overlapping it.
const chipSize = {
  sm: "text-[7px] px-1 py-0", // dropped in render, but keep a value for type-safety
  md: "text-[8px] px-1 py-[1px]",
  lg: "text-[9px] px-1.5 py-[1px]",
  xl: "text-[11px] px-2 py-[2px]",
};

const ringSize = {
  sm: "ring-2",
  md: "ring-2",
  lg: "ring-[3px]",
  xl: "ring-[3px]",
};

/**
 * Round avatar with the LinkedIn fallback aesthetic:
 *   1. Photo if `src` is set.
 *   2. Otherwise a generic person silhouette in a muted-grey disc — same
 *      shape and weight as LinkedIn's "no profile photo" placeholder.
 *
 * When `openToWork` is true, the avatar gets the LinkedIn green ring +
 * "#OpenToWork" chip overlay. Hidden on `sm` size to keep listings tidy.
 *
 * We dropped the "AS"-style initials block because two-letter monograms in
 * a tinted disc read as "missing photo" placeholder *plus* an unfinished
 * profile tag, which makes the layout look raw on a fresh signup. The
 * silhouette is recognisable instantly and never makes the user feel
 * the platform is half-built.
 */
export function Avatar({ src, name, size = "md", className, openToWork, hiring, ...props }: AvatarProps) {
  // Hiring wins when both are accidentally set (more deliberate signal).
  const status: "hiring" | "open" | null = hiring ? "hiring" : openToWork ? "open" : null;
  // The chip overlay would obscure most of an `sm` avatar — keep the ring
  // (which is still a useful "open"/"hiring" cue) but skip the chip at sm.
  const showChip = status !== null && size !== "sm";
  const showRing = status !== null;
  // Hiring uses the brand's dark teal — visually clearly distinct from
  // the lime "Open to work" ring so a viewer can tell at a glance which
  // side of the marketplace they're on.
  const ringColor = status === "hiring" ? "ring-emce-darkest" : "ring-emce-mid";
  const chipBg = status === "hiring" ? "bg-emce-darkest text-emce-mid" : "bg-emce-mid text-emce-darkest";
  const chipText = status === "hiring" ? "#Hiring" : "#OpenToWork";
  const ariaLabel = status === "hiring"
    ? (name ? `${name} — Hiring now` : "Hiring now")
    : (name ? `${name} — Open to work` : "Open to work");

  const inner = (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-emce-light-soft text-emce-dark/70",
        sizeMap[size],
        showRing && `${ringSize[size]} ${ringColor} ring-offset-2 ring-offset-white`,
        className,
      )}
      role={src ? undefined : "img"}
      aria-label={src ? undefined : (name ? `${name} avatar` : "Avatar")}
      {...props}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? ""} className="h-full w-full object-cover" />
      ) : (
        <PersonSilhouette />
      )}
    </div>
  );

  if (!showChip) return inner;

  // Wrap so we can position the chip absolutely relative to the avatar.
  // `aria-label` is hoisted to the wrapper so chip + ring are announced
  // as a single "X — Open to work / Hiring now" unit by screen readers.
  return (
    <div className="relative inline-flex" role="group" aria-label={ariaLabel}>
      {inner}
      <span
        className={cn(
          "pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full font-extrabold",
          chipBg,
          chipSize[size],
        )}
        aria-hidden="true"
      >
        {chipText}
      </span>
    </div>
  );
}

function PersonSilhouette() {
  // Sized at 70% of the avatar disc (matches LinkedIn's default placeholder
  // proportions). currentColor lets us re-tint the whole stack from CSS.
  return (
    <svg viewBox="0 0 24 24" className="h-[70%] w-[70%]" fill="currentColor" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8H4z" />
    </svg>
  );
}
