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
        {locales.map((l) => (
          <option key={l} value={l} className="text-emce-text">
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
