"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocale } from "@/server/i18n/actions";
import { locales, localeNames, type Locale } from "@/lib/i18n";

export function LanguageSwitcher({
  current,
  variant = "dark",
}: {
  current: Locale;
  variant?: "light" | "dark";
}) {
  const [pending, start] = useTransition();
  return (
    <label
      className={`inline-flex items-center gap-1 rounded-md px-2 text-xs font-bold ${
        variant === "dark" ? "text-white/80 hover:text-white" : "text-emce-text-sec hover:text-emce-dark"
      } ${pending ? "opacity-60" : ""}`}
      aria-label="Language"
      title="Language"
    >
      <Globe className="h-4 w-4" />
      <select
        value={current}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            await setLocale(e.target.value as Locale);
          })
        }
        className={`bg-transparent text-xs font-bold uppercase tracking-wide outline-none ${
          variant === "dark" ? "text-white/80" : "text-emce-text-sec"
        }`}
      >
        {/* Display the ISO code (EN / HI) on the closed select rather
            than the localised full name. The full names "English" /
            "हिन्दी" forced the header into multi-line wraps on phones
            and ate space the rest of the nav needed. The Globe icon
            on the left clarifies what the toggle is for. We hint at
            the full name via the option's `title` for screen readers
            + hover-tooltip in the open dropdown. */}
        {locales.map((l) => (
          <option key={l} value={l} className="text-emce-text" title={localeNames[l]}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}
