"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  InstitutionReviewerRelationship,
  InstitutionReviewStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { rateLimitOrThrow } from "@/lib/rate-limit";

/**
 * InstitutionReview CRUD — mirrors server/reviews/actions.ts for
 * companies. Reviews land PENDING and are admin-moderated before
 * surfacing on the public /institutions/<slug> page.
 *
 * Rate-limited per user (anonymous reviewers share an IP-keyed
 * bucket); one review per user per institution via the unique
 * constraint on (institutionId, reviewerUserId).
 */

const submitSchema = z.object({
  institutionId: z.string().min(1),
  relationship: z.nativeEnum(InstitutionReviewerRelationship),
  facultyRating: z.coerce.number().int().min(1).max(5),
  infrastructureRating: z.coerce.number().int().min(1).max(5),
  placementRating: z.coerce.number().int().min(1).max(5),
  contentRating: z.coerce.number().int().min(1).max(5),
  alumniRating: z.coerce.number().int().min(1).max(5),
  overallRating: z.coerce.number().int().min(1).max(5),
  headline: z.string().trim().min(8).max(220),
  pros: z.string().trim().min(20).max(2000),
  cons: z.string().trim().min(20).max(2000),
  programName: z.string().trim().max(120).optional(),
  graduationYear: z.coerce.number().int().min(1970).max(2099).optional(),
});

export async function submitInstitutionReview(formData: FormData): Promise<void> {
  let instSlug: string | null = null;
  try {
    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Anonymous reviewers share an IP-keyed rate-limit; signed-in
    // users get a per-user bucket. Either way the cap prevents a
    // single browser from spamming reviews.
    if (userId) {
      await rateLimitOrThrow(`inst-review:${userId}`, "invite").catch(() => undefined);
    }

    const parsed = submitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const err = parsed.error.issues[0]?.message ?? "Invalid review";
      const id = String(formData.get("institutionId") ?? "");
      const fallback = id
        ? await db.institution.findUnique({ where: { id }, select: { slug: true } })
        : null;
      redirect(
        `/institutions/${fallback?.slug ?? ""}/review?error=` + encodeURIComponent(err),
      );
    }

    const data = parsed.data;
    const inst = await db.institution.findUnique({
      where: { id: data.institutionId },
      select: { id: true, slug: true, name: true },
    });
    if (!inst) redirect("/institutions?error=Institution not found");
    instSlug = inst!.slug;

    // Idempotency — a signed-in user can update their existing review
    // (the unique constraint enforces one-per-user-per-institution).
    // Anonymous reviews don't have a userId so the constraint allows
    // multiple — the rate-limit caps abuse.
    await db.institutionReview.upsert({
      where: userId
        ? {
            institutionId_reviewerUserId: {
              institutionId: inst!.id,
              reviewerUserId: userId,
            },
          }
        : // No reviewerUserId to upsert on — fall through to create
          { id: "__create_only__" },
      create: {
        institutionId: inst!.id,
        reviewerUserId: userId,
        relationship: data.relationship,
        facultyRating: data.facultyRating,
        infrastructureRating: data.infrastructureRating,
        placementRating: data.placementRating,
        contentRating: data.contentRating,
        alumniRating: data.alumniRating,
        overallRating: data.overallRating,
        headline: data.headline,
        pros: data.pros,
        cons: data.cons,
        programName: data.programName || null,
        graduationYear: data.graduationYear ?? null,
        status: InstitutionReviewStatus.PENDING,
      },
      update: {
        relationship: data.relationship,
        facultyRating: data.facultyRating,
        infrastructureRating: data.infrastructureRating,
        placementRating: data.placementRating,
        contentRating: data.contentRating,
        alumniRating: data.alumniRating,
        overallRating: data.overallRating,
        headline: data.headline,
        pros: data.pros,
        cons: data.cons,
        programName: data.programName || null,
        graduationYear: data.graduationYear ?? null,
        // Editing a published review re-queues it for moderation —
        // mirrors the company behaviour and prevents review-by-edit
        // attacks where someone submits a clean review then swaps
        // the body for a personal attack.
        status: InstitutionReviewStatus.PENDING,
      },
    });

    try {
      await audit({
        actorId: userId,
        action: "institution.review.submit",
        entity: "Institution",
        entityId: inst!.id,
        meta: { headline: data.headline, overallRating: data.overallRating },
      });
    } catch {/* best-effort */}

    revalidatePath(`/institutions/${inst!.slug}`);
    revalidatePath("/admin/reviews");
    redirect(
      `/institutions/${inst!.slug}?notice=` +
        encodeURIComponent(
          "Thanks — your review is in moderation and usually goes live in 24 hours.",
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[submitInstitutionReview] failed");
    redirect(
      `/institutions/${instSlug ?? ""}/review?error=` +
        encodeURIComponent("Submit failed. Please try again."),
    );
  }
}

/**
 * Admin moderation — flips a review between PENDING / PUBLISHED /
 * REJECTED. Called from /admin/reviews via a tiny form.
 */
const moderateSchema = z.object({
  reviewId: z.string().min(1),
  action: z.enum(["PUBLISH", "REJECT", "WITHDRAW"]),
  notes: z.string().trim().max(500).optional(),
});

export async function moderateInstitutionReview(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") redirect("/403");
    const parsed = moderateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/admin/reviews?error=Invalid moderation request");

    const review = await db.institutionReview.findUnique({
      where: { id: parsed.data.reviewId },
      select: { institutionId: true, institution: { select: { slug: true } } },
    });
    if (!review) redirect("/admin/reviews?error=Review not found");

    const newStatus: InstitutionReviewStatus = {
      PUBLISH: InstitutionReviewStatus.PUBLISHED,
      REJECT: InstitutionReviewStatus.REJECTED,
      WITHDRAW: InstitutionReviewStatus.WITHDRAWN,
    }[parsed.data.action];

    await db.institutionReview.update({
      where: { id: parsed.data.reviewId },
      data: {
        status: newStatus,
        moderatedById: session.user.id,
        moderatedAt: new Date(),
        moderationNotes: parsed.data.notes || null,
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: `institution.review.${parsed.data.action.toLowerCase()}`,
        entity: "InstitutionReview",
        entityId: parsed.data.reviewId,
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/reviews");
    if (review!.institution?.slug) {
      revalidatePath(`/institutions/${review!.institution.slug}`);
    }
    redirect("/admin/reviews?notice=Review moderated");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[moderateInstitutionReview] failed");
    redirect("/admin/reviews?error=Moderation failed");
  }
}
