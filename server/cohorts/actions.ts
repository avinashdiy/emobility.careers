"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { withUniqueSlug } from "@/lib/slug";
import { audit } from "@/lib/audit";
import { CohortStatus } from "@prisma/client";

/**
 * Cohort CRUD — accessible to ADMIN or any user with
 * `User.isPlacementOfficer = true`. The latter is the path for trusted
 * DIYguru staff who shouldn't have full /admin reach.
 */

async function requireTpoOrAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isPlacementOfficer: true },
  });
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN" && !user.isPlacementOfficer) redirect("/403");
  return { session, user };
}

const cohortSchema = z.object({
  name: z.string().min(2).max(120),
  courseName: z.string().min(2).max(120),
  courseSlug: z.string().max(120).optional(),
  batchCode: z.string().max(20).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  institution: z.string().max(160).optional(),
  description: z.string().max(2000).optional(),
  capacity: z.coerce.number().int().min(0).max(10000).optional(),
});

export async function createCohort(formData: FormData) {
  const { session } = await requireTpoOrAdmin();
  const parsed = cohortSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/tpo/cohorts?error=" + encodeURIComponent("Please fill required fields."));
  }
  const data = parsed.data;

  const cohort = await withUniqueSlug(data.name, (slug) =>
    db.cohort.create({
      data: {
        slug,
        name: data.name,
        courseName: data.courseName,
        courseSlug: data.courseSlug || null,
        batchCode: data.batchCode || null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        institution: data.institution || null,
        description: data.description || null,
        capacity: data.capacity ?? null,
        createdById: session.user.id,
      },
      select: { id: true, slug: true, name: true },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "cohort.created",
    entity: "Cohort",
    entityId: cohort.id,
    meta: { name: cohort.name },
  });
  revalidatePath("/tpo/cohorts");
  redirect(`/tpo/cohorts/${cohort.slug}`);
}

export async function archiveCohort(formData: FormData) {
  const { session } = await requireTpoOrAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.cohort.update({
    where: { id },
    data: { status: CohortStatus.ARCHIVED },
  });
  await audit({ actorId: session.user.id, action: "cohort.archived", entity: "Cohort", entityId: id });
  revalidatePath("/tpo/cohorts");
}

export async function unarchiveCohort(formData: FormData) {
  const { session } = await requireTpoOrAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.cohort.update({
    where: { id },
    data: { status: CohortStatus.ACTIVE },
  });
  await audit({ actorId: session.user.id, action: "cohort.unarchived", entity: "Cohort", entityId: id });
  revalidatePath("/tpo/cohorts");
}

/**
 * Bulk-bind: take the selected DIYguruRoster rows and attach them to a
 * cohort. Used both during CSV import (admin picks a cohort target) and
 * after-the-fact when an admin realises a batch should have been
 * grouped. We also forward the cohort id onto any candidates who
 * already claimed those roster entries so the TPO funnel updates
 * immediately without a re-claim.
 */
export async function assignRosterToCohort(formData: FormData) {
  const { session } = await requireTpoOrAdmin();
  const cohortId = z.string().parse(formData.get("cohortId"));
  const rosterIds = formData.getAll("rosterId").map(String).filter(Boolean);
  if (rosterIds.length === 0) return;

  const cohort = await db.cohort.findUnique({ where: { id: cohortId }, select: { id: true } });
  if (!cohort) return;

  await db.$transaction(async (tx) => {
    await tx.dIYguruRoster.updateMany({
      where: { id: { in: rosterIds } },
      data: { cohortId },
    });

    // Forward to claimed candidates — `claimedByUserId` is the user, so
    // join via candidateProfile.userId.
    const claimed = await tx.dIYguruRoster.findMany({
      where: { id: { in: rosterIds }, claimedByUserId: { not: null } },
      select: { claimedByUserId: true },
    });
    const userIds = claimed.map((r) => r.claimedByUserId!).filter(Boolean);
    if (userIds.length > 0) {
      await tx.candidateProfile.updateMany({
        where: { userId: { in: userIds } },
        data: { cohortId },
      });
    }
  });

  await audit({
    actorId: session.user.id,
    action: "cohort.roster_assigned",
    entity: "Cohort",
    entityId: cohortId,
    meta: { count: rosterIds.length },
  });
  revalidatePath(`/tpo/cohorts`);
}
