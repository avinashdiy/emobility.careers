import { countryByCode, flagOf } from "@/lib/countries";

/**
 * Tiny country flag indicator. Renders the Unicode regional-indicator
 * flag emoji + (optional) country name, keyed off the candidate's
 * stored `country` (ISO alpha-2 code).
 *
 * No image asset / network round trip — modern browsers + iOS / Android
 * render flag emojis natively from system fonts. We keep the surface
 * area minimal so this component can sit inline next to a name in a
 * row of badges without affecting line height.
 *
 * Sizing comes from the parent's text size — the emoji inherits font
 * size automatically. We don't render anything when the code is null
 * or unknown so feeds / lists don't get cluttered with empty markers.
 */
export function CountryFlag({
  code,
  showName = false,
  className,
  size = "sm",
}: {
  code: string | null | undefined;
  showName?: boolean;
  className?: string;
  // sm = inline-with-name, md = profile header. The emoji itself gets
  // a size bump, the optional country-name label tracks Tailwind text.
  size?: "sm" | "md";
}) {
  if (!code) return null;
  const country = countryByCode(code);
  if (!country) return null;
  const emojiSize = size === "md" ? "text-lg" : "text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1 leading-none ${className ?? ""}`}
      title={country.name}
      aria-label={country.name}
    >
      <span className={emojiSize} role="img" aria-hidden>
        {flagOf(code) || country.flag}
      </span>
      {showName && (
        <span className="text-hint text-emce-text-sec">{country.name}</span>
      )}
    </span>
  );
}
