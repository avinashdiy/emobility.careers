"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notificationsQueue } from "@/lib/queues";
import { startOfThisWeekIST } from "./week";

/**
 * Featured This Week — admin curation. Five candidate slots per week
 * (positions 1..5). Visible on Pulse + home until the next Monday's
 * tick. Slots are unique by (weekStart, position) so admins can't
 * accidentally double-book a tile.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const featureSchema = z.object({
  candidateSlug: z.string().min(1),
  position: z.coerce.number().int().min(1).max(5),
  spotlightReason: z.string().max(280).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  weekStart: z.string().optional(), // ISO date — defaults to this week
});

export async function featureCandidate(formData: FormData) {
  const session = await requireAdmin();
  const parsed = featureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/featured?error=" + encodeURIComponent("Invalid input."));
  }
  const { candidateSlug, position, spotlightReason, imageUrl } = parsed.data;
  const weekStart = parsed.data.weekStart
    ? new Date(parsed.data.weekStart)
    : startOfThisWeekIST();

  const candidate = await db.candidateProfile.findUnique({
    where: { slug: candidateSlug },
    select: { id: true, slug: true, userId: true, firstName: true, cvVisibility: true },
  });
  if (!candidate) {
    redirect("/admin/featured?error=" + encodeURIComponent("Candidate not found."));
  }
  if (candidate.cvVisibility !== "EVERYONE") {
    redirect(
      "/admin/featured?error=" +
        encodeURIComponent(
          "Candidate's profile isn't public — featuring would 404 the share. Ask them to switch visibility first.",
        ),
    );
  }

  // Upsert by (weekStart, position) — replacing any prior slot at that
  // tile, ensures admins never double-book.
  await db.featuredSlot.upsert({
    where: { weekStart_position: { weekStart, position } },
    create: {
      candidateId: candidate.id,
      weekStart,
      position,
      spotlightReason: spotlightReason || null,
      imageUrl: imageUrl || null,
      featuredById: session.user.id,
      isActive: true,
    },
    update: {
      candidateId: candidate.id,
      spotlightReason: spotlightReason || null,
      imageUrl: imageUrl || null,
      featuredById: session.user.id,
      isActive: true,
    },
  });

  // Send the candidate an in-app notification so they can crow about it
  // on their own social feeds — every featured candidate is a potential
  // ambassador.
  await notificationsQueue.add("featured", {
    userId: candidate.userId,
    type: "profile.featured",
    title: "✨ You're featured this week",
    body: `Your profile is on the home page + Pulse this week. Tell your network — link to /pulse.`,
    link: `/${candidate.slug}`,
    channels: ["IN_APP", "EMAIL"],
  }).catch(() => undefined);

  await audit({
    actorId: session.user.id,
    action: "candidate.featured",
    entity: "CandidateProfile",
    entityId: candidate.id,
    meta: { weekStart: weekStart.toISOString(), position },
  });

  revalidatePath("/admin/featured");
  revalidatePath("/pulse");
  revalidatePath("/");
}

const unfeatureSchema = z.object({
  slotId: z.string(),
});

export async function unfeatureCandidate(formData: FormData) {
  const session = await requireAdmin();
  const parsed = unfeatureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const slot = await db.featuredSlot.findUnique({
    where: { id: parsed.data.slotId },
    select: { id: true, candidateId: true },
  });
  if (!slot) return;
  await db.featuredSlot.delete({ where: { id: slot.id } });
  await audit({
    actorId: session.user.id,
    action: "candidate.unfeatured",
    entity: "CandidateProfile",
    entityId: slot.candidateId,
  });
  revalidatePath("/admin/featured");
  revalidatePath("/pulse");
  revalidatePath("/");
}

/**
 * Read helper used by Pulse + the home page. Returns this week's
 * featured slots in position order, with the candidate's public card
 * data. Used as an override on top of the generic
 * `getFeaturedCandidates()` query — when the admin has curated, the
 * curated slots win.
 */
export async function getFeaturedThisWeek() {
  const weekStart = startOfThisWeekIST();
  const slots = await db.featuredSlot.findMany({
    where: { weekStart, isActive: true },
    orderBy: { position: "asc" },
    include: {
      candidate: {
        select: {
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
          openToWork: true,
          totalExperienceMonths: true,
        },
      },
    },
  });
  return slots;
}
