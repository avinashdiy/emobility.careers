"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { audit } from "@/lib/audit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { pgRateLimit } from "@/lib/rate-limit-pg";

/**
 * Server actions for the "I started a new role" announcement flow
 * that powers /pulse → Who's Moving.
 *
 *   announceJobChange()  — candidate publishes a JobChangeAnnouncement
 *                          row from their /me/profile or right after
 *                          adding a current Experience. Opt-in only —
 *                          we never auto-announce.
 *   retractJobChange()   — flips published=false; the row stays for
 *                          the audit trail but disappears from
 *                          /pulse.
 *
 * Rate limit: 3/30 days per user. The PG limiter persists across
 * Redis restarts, which matters here — a malicious bulk-announce
 * spam path would taint the Pulse feed otherwise.
 */

const announceSchema = z.object({
  toCompany: z.string().trim().min(1).max(120),
  toCompanyId: z.string().optional(),
  toTitle: z.string().trim().min(2).max(120),
  fromCompany: z.string().trim().max(120).optional(),
  fromTitle: z.string().trim().max(120).optional(),
  note: z.string().trim().max(280).optional(),
});

export async function announceJobChange(
  formData: FormData,
): Promise<{ ok: boolean; message: string; id?: string }> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin?next=/me/profile");
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, announceJobChange: true },
    });
    if (!profile) redirect("/onboarding");

    const parsed = announceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Please check the form fields and try again.",
      };
    }

    // Rate limit: 3 announcements per 30 days per user. Generous
    // enough that someone changing jobs twice doesn't get stuck;
    // tight enough that a compromised account can't flood Pulse.
    const limit = await pgRateLimit({
      action: "profile.job_change_announce",
      userId: session.user.id,
      opts: { limit: 3, windowMs: 30 * 24 * 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    // If the candidate didn't pass a toCompanyId, try to resolve the
    // free-text `toCompany` against the canonical Company table by
    // name. Match is case-insensitive and exact — fuzzy matching
    // would risk pinning the announcement to the wrong company.
    let toCompanyId = parsed.data.toCompanyId ?? null;
    if (!toCompanyId) {
      const found = await db.company.findFirst({
        where: { name: { equals: parsed.data.toCompany, mode: "insensitive" } },
        select: { id: true },
      });
      toCompanyId = found?.id ?? null;
    }

    const created = await db.jobChangeAnnouncement.create({
      data: {
        candidateId: profile.id,
        toCompany: parsed.data.toCompany,
        toCompanyId,
        toTitle: parsed.data.toTitle,
        fromCompany: parsed.data.fromCompany ?? null,
        fromTitle: parsed.data.fromTitle ?? null,
        note: parsed.data.note ?? null,
      },
    });

    // Auto-flip the candidate's `announceJobChange` flag to true so
    // /me/preferences reflects the active opt-in. We never set it
    // back without explicit user action.
    if (!profile.announceJobChange) {
      await db.candidateProfile.update({
        where: { id: profile.id },
        data: { announceJobChange: true },
      });
    }

    await audit({
      actorId: session.user.id,
      action: "profile.job_change_announced",
      entity: "JobChangeAnnouncement",
      entityId: created.id,
      meta: {
        toCompany: parsed.data.toCompany,
        toTitle: parsed.data.toTitle,
      },
    });

    revalidatePath("/pulse");
    revalidatePath("/me/profile");
    return {
      ok: true,
      message: "Posted to /pulse — congratulations on the new role!",
      id: created.id,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[job-change] announce failed");
    return { ok: false, message: "Couldn't post the announcement. Try again." };
  }
}

export async function retractJobChange(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin?next=/me/profile");
    const id = z.string().parse(formData.get("id"));
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) redirect("/onboarding");
    // Ownership-scoped update — silently no-ops if the id doesn't
    // belong to the calling candidate.
    await db.jobChangeAnnouncement.updateMany({
      where: { id, candidateId: profile.id },
      data: { published: false },
    });
    await audit({
      actorId: session.user.id,
      action: "profile.job_change_retracted",
      entity: "JobChangeAnnouncement",
      entityId: id,
    });
    revalidatePath("/pulse");
    revalidatePath("/me/profile");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[job-change] retract failed");
  }
}
