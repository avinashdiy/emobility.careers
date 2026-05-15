"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { computeEmployerAwards } from "@/server/reviews/awards";

/**
 * #26 — Admin trigger for the yearly award computation. Runs the
 * `computeEmployerAwards` ranking + upserts EmployerAward rows.
 * Cheap enough to run synchronously on the admin click; production
 * cron tick will call the same function on a yearly schedule.
 */

const computeSchema = z.object({
  year: z.coerce.number().int().min(2024).max(2099),
});

export async function computeAwardsAction(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
    const parsed = computeSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/awards?error=" + encodeURIComponent("Invalid year."));
    }
    const result = await computeEmployerAwards(parsed.data.year);
    try {
      await audit({
        actorId: session.user.id,
        action: "awards.computed",
        entity: "EmployerAward",
        entityId: String(parsed.data.year),
        meta: { computed: result.computed },
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/awards");
    revalidatePath("/awards");
    redirect(
      `/admin/awards?notice=` +
        encodeURIComponent(`Computed ${result.computed} award rows for ${parsed.data.year}.`),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[awards.compute] unexpected");
    redirect("/admin/awards?error=" + encodeURIComponent("Couldn't compute — see logs."));
  }
}
