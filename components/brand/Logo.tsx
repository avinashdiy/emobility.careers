import Image from "next/image";

/**
 * Full eMobility Careers wordmark — icon + text rendered together as a
 * single PNG (4:1 aspect, 2000×500 source). Use this anywhere you'd put
 * the brand "logo": header, full footer, auth/onboarding shells, marketing
 * pages.
 *
 * **Do not** pair this component with a separate icon mark — the wordmark
 * already includes the icon. The matching `IconMark` component is for
 * places that want the icon alone (favicon, mobile chrome, OG corner
 * badges, app shells where horizontal space is tight).
 *
 * Sizing follows LinkedIn-fidelity heights:
 *   - sm  → 20px tall (compact footer / badges)
 *   - md  → 28px tall (header / shell layouts) — default
 *   - lg  → 36px tall (auth split-screen brand)
 *   - xl  → 48px tall (marketing hero)
 *
 * The component renders with width = height × 4 to preserve aspect ratio.
 */

type LogoSize = "sm" | "md" | "lg" | "xl";

const SIZES: Record<LogoSize, { h: number; w: number }> = {
  sm: { h: 20, w: 80 },
  md: { h: 28, w: 112 },
  lg: { h: 36, w: 144 },
  xl: { h: 48, w: 192 },
};

export function Logo({
  size = "md",
  className,
  priority,
}: {
  size?: LogoSize;
  className?: string;
  /** Pass when the logo is in the LCP fold (header). */
  priority?: boolean;
}) {
  const { h, w } = SIZES[size];
  return (
    <Image
      src="/brand/logo.png"
      alt="eMobility Careers"
      width={w}
      height={h}
      priority={priority}
      className={className}
      // Prevent Next from picking a smaller src; we want the 4× DPI version
      // baked in for crisp retina rendering at small heights.
      quality={95}
    />
  );
}
