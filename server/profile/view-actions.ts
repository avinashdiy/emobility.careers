"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ViewerVisibility } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

const visibilitySchema = z.object({
  viewerVisibility: z.nativeEnum(ViewerVisibility),
});

/**
 * Flip the viewer's privacy mode. Form submits a single
 * `viewerVisibility` field (VISIBLE / ANONYMOUS). The page that
 * holds the toggle is /me/views.
 *
 * Trade-off the user is making (mirrored from LinkedIn):
 *   • VISIBLE — they see who views them; their identity is recorded
 *     when they view others.
 *   • ANONYMOUS — they're invisible to viewed users AND see only
 *     anonymous-shape rows on their own /me/views.
 *
 * The reciprocal cost is enforced at READ time in
 * /me/views/page.tsx, not at WRITE time — flipping back to VISIBLE
 * doesn't retro-grant access, but it does grant access going
 * forward.
 */
export async function setViewerVisibility(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");

    const parsed = visibilitySchema.safeParse({
      viewerVisibility: formData.get("viewerVisibility"),
    });
    if (!parsed.success) {
      logger.warn(
        { userId: session.user.id, fieldErrors: parsed.error.flatten().fieldErrors },
        "[setViewerVisibility] validation failed",
      );
      redirect(
        "/me/views?error=" + encodeURIComponent("Couldn't update — try again."),
      );
    }

    await db.candidateProfile.update({
      where: { userId: session.user.id },
      data: { viewerVisibility: parsed.data.viewerVisibility },
    });
    await audit({
      actorId: session.user.id,
      action: "profile.viewer_visibility_set",
      entity: "CandidateProfile",
      entityId: session.user.id,
      meta: { viewerVisibility: parsed.data.viewerVisibility },
    });
    revalidatePath("/me/views");
    revalidatePath("/feed");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[profile-views] visibility toggle failed");
    redirect("/me/views?error=" + encodeURIComponent("Couldn't update — try again."));
  }
}
