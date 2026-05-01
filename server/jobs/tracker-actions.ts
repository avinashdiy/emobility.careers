"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";

/**
 * Server actions for the candidate-side Job Tracker (the kanban view
 * at /me/applications). These are NOT the employer ATS actions —
 * those live in server/ats/actions.ts. The candidate cannot move
 * their own application between stages (that's the recruiter's
 * decision); they can only:
 *   • Withdraw an application
 *   • Add a private note (visibility = PRIVATE so recruiters can't see)
 *   • Edit their existing private note
 *   • Drop a saved job from the Saved column
 *
 * The kanban "drag-drop between Saved → Applied" path uses the
 * existing applyToJob action — this file doesn't handle apply.
 */

/**
 * Save a private (NoteVisibility.PRIVATE) note attached to one of the
 * candidate's own applications. Used for the inline notes field on
 * each kanban card. Idempotent — re-submitting replaces any prior
 * private note from this user on this application.
 */
export async function saveTrackerNote(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin?next=/me/applications");

    const schema = z.object({
      applicationId: z.string().min(1),
      body: z.string().max(2000),
    });
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return;

    // Verify ownership — the application must belong to the calling
    // candidate. We do this in one query so a forged applicationId
    // can't write to someone else's row.
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) redirect("/onboarding");
    const app = await db.application.findFirst({
      where: { id: parsed.data.applicationId, candidateId: profile.id },
      select: { id: true },
    });
    if (!app) return; // silently no-op on cross-account attempts

    if (parsed.data.body.trim().length === 0) {
      // Empty body = clear all this candidate's private notes for the
      // application. Saves them having to find a "delete" affordance.
      await db.applicationNote.deleteMany({
        where: {
          applicationId: app.id,
          authorId: session.user.id,
          visibility: "PRIVATE",
        },
      });
    } else {
      // Upsert pattern via deleteMany + create — Prisma's upsert needs
      // a unique constraint we don't have (one private note per
      // candidate per application). Two-step keeps this simple and
      // honest.
      await db.$transaction([
        db.applicationNote.deleteMany({
          where: {
            applicationId: app.id,
            authorId: session.user.id,
            visibility: "PRIVATE",
          },
        }),
        db.applicationNote.create({
          data: {
            applicationId: app.id,
            authorId: session.user.id,
            body: parsed.data.body.trim(),
            visibility: "PRIVATE",
          },
        }),
      ]);
    }
    revalidatePath("/me/applications");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[tracker] saveTrackerNote failed");
  }
}

/**
 * Drop a SavedJob row from the Saved column. The existing
 * `unsaveJob` server action does the same thing but redirects back
 * to /me/saved on success — for the kanban we want a quiet revalidate
 * + return-to-kanban flow, hence this dedicated action.
 */
export async function dropFromSaved(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin?next=/me/applications");
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) redirect("/onboarding");
    const jobId = z.string().parse(formData.get("jobId"));
    await db.savedJob.deleteMany({
      where: { candidateId: profile.id, jobId },
    });
    revalidatePath("/me/applications");
    revalidatePath("/me/saved");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[tracker] dropFromSaved failed");
  }
}
