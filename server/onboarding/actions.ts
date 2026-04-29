"use server";

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

/**
 * Stamp `User.productTourCompletedAt` so the post-signup welcome
 * walkthrough never opens again for this user. Idempotent — re-calls
 * are no-ops because the column has a NOT NULL value after the first
 * run.
 *
 * Fired by the ProductTour overlay on either "Skip tour" or "Get
 * started" — both close the tour, both mark it as seen. The action is
 * intentionally tiny (one column write) so the modal-close UX feels
 * instant; we don't await this in the client.
 */
export async function completeProductTour(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user) return { ok: false };
  await db.user.update({
    where: { id: session.user.id },
    data: { productTourCompletedAt: new Date() },
  }).catch(() => undefined);
  return { ok: true };
}
