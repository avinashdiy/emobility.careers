import * as React from "react";
import { cn } from "@/lib/utils";

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * LinkedIn-style "#OpenToWork" green ring around the avatar disc plus
   * a small green chip pinned to the bottom-right. Renders only when
   * `openToWork` is true *and* size is "md" or larger — at "sm" the chip
   * obscures the avatar, so we silently drop it on small renders.
   */
  openToWork?: boolean;
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
export function Avatar({ src, name, size = "md", className, openToWork, ...props }: AvatarProps) {
  // The chip overlay would obscure most of an `sm` avatar — keep the ring
  // (which is still a useful "open" cue) but skip the chip at that size.
  const showChip = openToWork && size !== "sm";
  const showRing = !!openToWork;

  const inner = (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-emce-light-soft text-emce-dark/70",
        sizeMap[size],
        showRing && `${ringSize[size]} ring-emce-mid ring-offset-2 ring-offset-white`,
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
  // `aria-label` is hoisted to the wrapper so the chip + ring are
  // announced as a single "X — Open to work" unit by screen readers.
  return (
    <div
      className="relative inline-flex"
      role="group"
      aria-label={name ? `${name} — Open to work` : "Open to work"}
    >
      {inner}
      <span
        className={cn(
          "pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emce-mid font-extrabold text-emce-darkest",
          chipSize[size],
        )}
        aria-hidden="true"
      >
        #OpenToWork
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
