"use server";

/**
 * Recruitathon JD-selection action. A candidate picks up to 3 JDs to be
 * tested on; we snapshot the AI match score at selection time and route
 * them to the test overview.
 */

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getRankedJdsForCandidate } from "@/lib/recruitathon/jd-matching";
import { MAX_JD_SELECTIONS } from "@/lib/recruitathon/exam-config";

export async function selectJds(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/recruitathon/onboarding");

  // jdIds arrive as repeated "jdId" fields (checkbox group).
  const jdIds = z
    .array(z.string())
    .parse(formData.getAll("jdId").map(String))
    .filter(Boolean);

  if (jdIds.length === 0) {
    redirect("/recruitathon/select?error=" + encodeURIComponent("Pick at least one role."));
  }
  const chosen = jdIds.slice(0, MAX_JD_SELECTIONS);

  // Validate the JDs exist + are active; snapshot the match score.
  const jds = await db.recruitathonJd.findMany({
    where: { id: { in: chosen }, isActive: true },
    select: { id: true, driveId: true },
  });
  if (jds.length === 0) redirect("/recruitathon/select?error=" + encodeURIComponent("Those roles are no longer available."));

  const driveId = jds[0].driveId ?? "";
  const ranked = driveId ? await getRankedJdsForCandidate(profile.id, driveId) : [];
  const scoreById = new Map(ranked.map((r) => [r.jd.id, r.match.score]));

  // Replace the candidate's selection set atomically.
  await db.$transaction([
    db.recruitathonJdSelection.deleteMany({ where: { candidateId: profile.id } }),
    db.recruitathonJdSelection.createMany({
      data: jds.map((j) => ({ candidateId: profile.id, jdId: j.id, matchScore: scoreById.get(j.id) ?? null })),
    }),
  ]);

  revalidatePath("/recruitathon/tests");
  redirect("/recruitathon/tests");
}
