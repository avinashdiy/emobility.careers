import Image from "next/image";

/**
 * Square icon-only mark, no wordmark. Use this where LinkedIn would show
 * just the "in" badge — favicon-style chrome, mobile-condensed headers
 * where the wordmark is too wide, OG image corner badges, app shell
 * sidebars, and the like.
 *
 * Rendered from the 2000×2000 source PNG so it stays crisp on retina at
 * any of the size presets below. The wrapper element keeps the image
 * inside a small rounded square — same styling LinkedIn uses for its
 * favicon-on-card moments.
 *
 * Pair this with **either** a wordmark `<Logo />` *or* the icon alone — never both.
 */

type IconSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<IconSize, number> = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
};

export function IconMark({
  size = "md",
  className,
  priority,
}: {
  size?: IconSize;
  className?: string;
  priority?: boolean;
}) {
  const px = SIZES[size];
  return (
    <Image
      src="/brand/icon.png"
      alt="eMobility Careers"
      width={px}
      height={px}
      priority={priority}
      className={className}
      quality={95}
    />
  );
}
