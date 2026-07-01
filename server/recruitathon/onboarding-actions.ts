"use server";

/**
 * Recruitathon test-onboarding actions. Thin, redirect-back-to-the-
 * stepper wrappers so the "next, next" flow keeps moving without
 * client-side form plumbing. The heavy lifting (CV upload + AI
 * profile autofill) is done by the shared uploadAndParseResume; this
 * file only covers the quick text-field gap-fill the stepper needs to
 * push a candidate across the 50% completeness gate.
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

/** Safe internal return path back into the stepper (preserves ?next=). */
function stepperPath(formData: FormData): string {
  const raw = formData.get("next");
  const next = typeof raw === "string" && raw.startsWith("/recruitathon/") && !raw.startsWith("//") ? raw : null;
  return next ? `/recruitathon/onboarding?next=${encodeURIComponent(next)}` : "/recruitathon/onboarding";
}

const basicsSchema = z.object({
  headline: z.string().trim().min(10).max(140),
  location: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Save headline + location (+ optional summary) — the cheapest,
 *  highest-weight completeness wins — then bounce back to the stepper. */
export async function saveOnboardingBasics(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const back = stepperPath(formData);

  const parsed = basicsSchema.safeParse({
    headline: formData.get("headline"),
    location: formData.get("location"),
    summary: formData.get("summary"),
  });
  if (!parsed.success) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent("Add a headline (10+ chars) and your city.")}`);
  }

  await db.candidateProfile.update({
    where: { userId: session.user.id },
    data: {
      headline: parsed.data.headline,
      location: parsed.data.location,
      ...(parsed.data.summary ? { summary: parsed.data.summary } : {}),
    },
  });

  revalidatePath("/recruitathon/onboarding");
  redirect(back);
}
