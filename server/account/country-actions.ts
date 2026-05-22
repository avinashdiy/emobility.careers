"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Country } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * "Confirm your country" actions — wire the `ConfirmCountryBanner`
 * (PR 6) and the future `/me/settings` country picker to the
 * `User.country` + `User.countryConfirmedAt` columns.
 *
 * Two surfaces today:
 *
 *   • `confirmCountry(formData)` — the banner's primary CTA. Reads
 *     the dropdown's selected country, persists it, stamps
 *     `countryConfirmedAt = now()` so the banner won't re-surface.
 *     ALSO updates the `emce_country` cookie (set by PR 2's
 *     CountrySelector) so the next render — and any sub-pages of
 *     the same session — see the new country immediately without
 *     a re-fetch.
 *
 *   • `snoozeCountryConfirmation()` — the banner's "Not now"
 *     escape hatch. Stamps `countryConfirmedAt = now()` without
 *     touching `country`. The user remains on their current (likely
 *     IN-default) value, the banner stops nagging. Encoded as a
 *     deliberate "I confirm my country is correct as-is" signal so
 *     we don't surface the banner forever for users who genuinely
 *     are Indian and never want to look at it.
 *
 * Both are server actions (not route handlers) so the form-based
 * banner submission keeps the page server-rendered + the user
 * stays where they are after save. No client JS required for the
 * banner itself — it's a pure server component with native form
 * submission.
 */

const confirmSchema = z.object({
  country: z.nativeEnum(Country, {
    errorMap: () => ({ message: "Pick a country" }),
  }),
  // Where to return after save. The banner sets this from the
  // current `x-pathname` header so the user lands back on the
  // page they were reading. Defaults to /me when missing.
  returnTo: z.string().optional(),
});

/**
 * Update the user's country + stamp the confirmation marker.
 *
 * Auth: must be logged in. Returns silently (redirect to /signin)
 * if not — the banner is only rendered for authenticated users,
 * so this branch only fires on a stale-session edge case.
 */
export async function confirmCountry(formData: FormData): Promise<void> {
  try {
    const parsed = confirmSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      // Invalid input → silent bounce. The dropdown is constrained
      // to the supported set, so this only fires on a tampered
      // submission. No user-facing error message needed.
      redirect("/me");
    }
    const session = await auth();
    if (!session?.user?.id) redirect("/signin");

    await db.user.update({
      where: { id: session.user.id },
      data: {
        country: parsed.data.country,
        countryConfirmedAt: new Date(),
      },
    });

    // Mirror the choice into the `emce_country` cookie so the
    // header's CountrySelector (PR 2) and the viewer-country
    // resolver (PR 4) honour it on every subsequent render
    // without a fresh DB hit. 1-year max-age + SameSite=Lax —
    // same shape the CountrySelector writes.
    const ck = await cookies();
    ck.set("emce_country", parsed.data.country, {
      path: "/",
      maxAge: 31_536_000,
      sameSite: "lax",
    });

    revalidatePath("/me");
    const safeReturn =
      parsed.data.returnTo && parsed.data.returnTo.startsWith("/")
        ? parsed.data.returnTo
        : "/me";
    redirect(`${safeReturn}?notice=` + encodeURIComponent("Country saved."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[confirmCountry] failed");
    redirect("/me?error=" + encodeURIComponent("Couldn't save country — try again."));
  }
}

/**
 * "Not now / dismiss" — stamp `countryConfirmedAt` without
 * touching `country`. Suppresses the banner permanently for users
 * who are correctly defaulted to IN.
 *
 * Why "permanently" not "for 30 days":
 *   The country column is a near-permanent attribute (changes
 *   when someone genuinely relocates — rare). A 30-day re-prompt
 *   would feel like nagging for a question the user has already
 *   answered. If their country truly changes, they update it
 *   from /me/settings.
 */
export async function snoozeCountryConfirmation(): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user?.id) redirect("/signin");

    await db.user.update({
      where: { id: session.user.id },
      data: { countryConfirmedAt: new Date() },
    });
    revalidatePath("/me");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.warn({ err }, "[snoozeCountryConfirmation] failed");
    // Silent on failure — the worst case is the banner re-surfaces
    // on the next page load. No user-facing impact.
  }
}
