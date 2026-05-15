"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ReviewerRelationship, CompanyReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import {
  snapshotFormData,
  zodErrorsToFieldErrors,
  type FormState,
} from "@/lib/form-state";

/**
 * #26 Best EV Employer — review CRUD.
 *
 * Anyone can submit a review (sign-in optional but encouraged — signed-
 * in reviewers get a "verified employee" pill when their EmployerProfile
 * matches the company they're reviewing). All reviews land in PENDING
 * and require admin moderation before publishing.
 *
 * Rate-limited per user (anonymous reviewers share an IP-keyed bucket
 * via the existing rate-limit infra) + one review per user per company
 * (unique constraint on the table).
 */

const submitSchema = z.object({
  companyId: z.string().min(1),
  relationship: z.nativeEnum(ReviewerRelationship),
  cultureRating: z.coerce.number().int().min(1).max(5),
  compensationRating: z.coerce.number().int().min(1).max(5),
  managementRating: z.coerce.number().int().min(1).max(5),
  growthRating: z.coerce.number().int().min(1).max(5),
  workLifeRating: z.coerce.number().int().min(1).max(5),
  overallRating: z.coerce.number().int().min(1).max(5),
  headline: z.string().trim().min(8).max(220),
  pros: z.string().trim().min(20).max(2000),
  cons: z.string().trim().min(20).max(2000),
  reviewerJobTitle: z.string().trim().max(120).optional(),
  reviewerLocation: z.string().trim().max(120).optional(),
});

export async function submitCompanyReview(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const parsed = submitSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
        prevValues: snapshotFormData(formData),
      };
    }
    const data = parsed.data;

    const session = await auth();
    const userId = session?.user?.id ?? null;

    // Rate limit. Anonymous reviewers go through pgRateLimit only
    // (which tracks by anonId cookie via the existing infra). Signed-
    // in reviewers also pass the Redis bucket.
    if (userId) {
      try {
        await rateLimitOrThrow(`review:${userId}`, "saveItem");
      } catch (err) {
        if (isRouterControlError(err)) throw err;
        return { ok: false, message: "Slow down — try again in a moment." };
      }
    }
    const pg = await pgRateLimit({
      action: "review.submit",
      userId: userId ?? "anon:review",
    });
    if (!pg.ok) return { ok: false, message: pg.message };

    const company = await db.company.findUnique({
      where: { id: data.companyId },
      select: { id: true, slug: true, name: true, verificationStatus: true },
    });
    if (!company) return { ok: false, message: "Company not found." };
    if (company.verificationStatus === "REJECTED") {
      return { ok: false, message: "Can't review a removed company." };
    }

    // One review per user per company. The schema has a unique
    // constraint on (companyId, reviewerUserId); for anonymous
    // reviews this lets multiple anonymous rows coexist.
    if (userId) {
      const existing = await db.companyReview.findUnique({
        where: { companyId_reviewerUserId: { companyId: company.id, reviewerUserId: userId } },
      });
      if (existing) {
        return {
          ok: false,
          message: "You've already submitted a review for this company. Reach out to support to amend it.",
        };
      }
    }

    const review = await db.companyReview.create({
      data: {
        companyId: company.id,
        reviewerUserId: userId,
        relationship: data.relationship,
        cultureRating: data.cultureRating,
        compensationRating: data.compensationRating,
        managementRating: data.managementRating,
        growthRating: data.growthRating,
        workLifeRating: data.workLifeRating,
        overallRating: data.overallRating,
        headline: data.headline,
        pros: data.pros,
        cons: data.cons,
        reviewerJobTitle: data.reviewerJobTitle ?? null,
        reviewerLocation: data.reviewerLocation ?? null,
        status: CompanyReviewStatus.PENDING,
      },
    });

    try {
      await audit({
        actorId: userId ?? "anon",
        action: "review.submitted",
        entity: "CompanyReview",
        entityId: review.id,
        meta: { companyId: company.id, anonymous: !userId },
      });
    } catch {/* best-effort */}

    revalidatePath(`/company/${company.slug}`);
    return {
      ok: true,
      message: "Submitted. We'll review it within 24 hours.",
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[reviews.submit] unexpected");
    return { ok: false, message: "Couldn't submit — try again." };
  }
}

const moderateSchema = z.object({
  reviewId: z.string().min(1),
  decision: z.enum(["PUBLISH", "REJECT"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function moderateReview(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
    const parsed = moderateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/admin/reviews?error=" + encodeURIComponent("Invalid request."));

    const review = await db.companyReview.findUnique({
      where: { id: parsed.data.reviewId },
    });
    if (!review) redirect("/admin/reviews?error=" + encodeURIComponent("Review not found."));

    await db.companyReview.update({
      where: { id: review.id },
      data: {
        status:
          parsed.data.decision === "PUBLISH"
            ? CompanyReviewStatus.PUBLISHED
            : CompanyReviewStatus.REJECTED,
        moderatedById: session.user.id,
        moderatedAt: new Date(),
        moderationNotes: parsed.data.notes ?? null,
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action:
          parsed.data.decision === "PUBLISH"
            ? "review.published"
            : "review.rejected",
        entity: "CompanyReview",
        entityId: review.id,
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/reviews");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[reviews.moderate] unexpected");
    redirect("/admin/reviews?error=" + encodeURIComponent("Couldn't moderate — try again."));
  }
}
