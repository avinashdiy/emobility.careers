"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, locales, type Locale } from "@/lib/i18n";

export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) return;
  const c = await cookies();
  c.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: false,  // we want the client to read it for instant SSR-cache busting
    secure: process.env.NODE_ENV === "production",
  });
  // Force the current page (and any data fetches) to re-render in the new locale.
  revalidatePath("/", "layout");
}
