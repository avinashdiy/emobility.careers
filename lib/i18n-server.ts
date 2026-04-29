import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, locales, defaultLocale, type Locale } from "@/lib/i18n";

/** Read the active locale from the request cookie (defaults to English). */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  return locales.includes(v as Locale) ? (v as Locale) : defaultLocale;
}
