"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { buckets, objectKey, publicUrl, s3 } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Twitter-style ID verification flow. The candidate uploads a
 * government-ID image (Aadhar by default in India, but the schema
 * is generic — passport / driver's licence work too) and the row
 * goes into the admin queue at `/admin/identity-verifications`.
 *
 * Storage strategy:
 *   • Image goes into the private `docs` bucket — never public-read.
 *   • Admin views the image via a server-side presigned GET when
 *     reviewing the queue (see admin actions below).
 *   • We never persist the Aadhar number itself, only the image. After
 *     approval the image stays in storage for audit purposes; the
 *     candidate can request deletion under DPDPA / GDPR via the
 *     account-deletion flow which already cascades all PII.
 *
 * Rate-limited so a misbehaving client can't fill our docs bucket
 * with junk uploads. Sensible cap because re-submissions are rare.
 */

const ALLOWED_ID_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf", // some users scan to PDF
]);

const MAX_BYTES = 6 * 1024 * 1024; // 6MB — typical Aadhar PDF is <1MB

async function requireCandidate() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  // Owner-based gate. ID verification on your own profile is a
  // self-action — role doesn't enter into it. An EMPLOYER editing
  // their personal page is just as entitled to upload an Aadhaar
  // for the blue checkmark as a CANDIDATE is. See the matching note
  // in server/candidates/actions.ts → requireCandidate().
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  return { session, profile };
}

// Re-export of the shared helper kept under this name so existing
// uses below don't need to change. See `lib/server-action-errors.ts`
// for the full rationale.
import { isRouterControlError } from "@/lib/server-action-errors";

export async function submitIDVerification(formData: FormData): Promise<{
  ok: boolean;
  message: string;
}> {
  // Top-level try/catch so an unexpected throw (MinIO outage, schema
  // mismatch on the prod DB, Prisma constraint violation, Redis down
  // mid-request, etc.) surfaces as a graceful toast instead of the
  // global "something went wrong" page. Real errors land in the server
  // logs at `error` level so ops can grep for `[id-verify]`.
  try {
    const { session, profile } = await requireCandidate();
    await rateLimitOrThrow(`id-verify:${profile.userId}`, "resumeUpload");
    const pgLimit = await pgRateLimit({
      action: "id_verification.submit",
      userId: profile.userId,
    });
    if (!pgLimit.ok) return { ok: false, message: pgLimit.message };

    const file = formData.get("idDoc") as File | null;
    if (!file || file.size === 0) {
      return { ok: false, message: "Please pick a file." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, message: "File must be under 6MB." };
    }
    if (file.type && !ALLOWED_ID_MIMES.has(file.type)) {
      return {
        ok: false,
        message: "Only JPEG, PNG, WebP, or PDF accepted.",
      };
    }
    // Don't allow re-submission while a request is already pending —
    // forces the candidate to wait for review or admin action so the
    // queue doesn't get spammed by repeated uploads of the same person.
    if (profile.idVerificationStatus === "PENDING") {
      return {
        ok: false,
        message: "You've already submitted — admins are reviewing it.",
      };
    }
    if (profile.idVerificationStatus === "VERIFIED") {
      return {
        ok: true,
        message: "You're already verified.",
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext =
      file.type === "application/pdf"
        ? "pdf"
        : file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
    const key = objectKey(`identity/${profile.id}`, ext);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: buckets.docs,
          Key: key,
          Body: buffer,
          ContentType: file.type || `image/${ext}`,
          // Private — admin reads via server-side presigned GET.
          Metadata: { "x-content-type-options": "nosniff" },
        }),
      );
    } catch (err) {
      logger.error(
        { err, profileId: profile.id, bucket: buckets.docs, key },
        "[id-verify] MinIO upload failed",
      );
      return {
        ok: false,
        message:
          "Couldn't upload the image — likely a storage issue on our end. Try again in a minute.",
      };
    }

    // We store the URL in `publicUrl` form for symmetry with other
    // image fields, but the bucket isn't actually public — the
    // download requires a presigned URL. The URL is just a stable
    // identifier; admin code re-presigns by deriving the key from it.
    const docUrl = publicUrl("docs", key);

    try {
      await db.candidateProfile.update({
        where: { id: profile.id },
        data: {
          idVerificationStatus: "PENDING",
          idVerificationDocUrl: docUrl,
          idVerificationSubmittedAt: new Date(),
          idVerificationReviewedAt: null,
          idVerificationReviewedById: null,
          idVerificationNotes: null,
        },
      });
    } catch (err) {
      // Most likely cause in production: schema columns / enum exist
      // in `schema.prisma` but haven't been pushed to the prod DB.
      // Logging the full error so the operator can read the Prisma
      // error code (P2002 unique violation, P2025 not found, etc.)
      // straight from the container logs.
      logger.error(
        { err, profileId: profile.id },
        "[id-verify] DB update failed — check that idVerification* columns + IDVerificationStatus enum exist on prod DB",
      );
      return {
        ok: false,
        message:
          "Couldn't save your submission — the team has been notified. Try again later.",
      };
    }

    // Audit + admin notify are best-effort; either failing should not
    // sink the candidate's UX since the actual verification request
    // has already landed in the DB above.
    try {
      await audit({
        actorId: session.user.id,
        action: "id_verification.submitted",
        entity: "CandidateProfile",
        entityId: profile.id,
      });
    } catch (err) {
      logger.warn({ err, profileId: profile.id }, "[id-verify] audit log failed");
    }

    // Notify all admins so the new request shows up in their inbox.
    // We fan out via queue rather than e-mail loop here so a quiet
    // outage doesn't block the candidate's submission UX.
    try {
      const admins = await db.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE" },
        select: { id: true },
      });
      for (const a of admins) {
        await dispatchNotification({
          userId: a.id,
          type: "admin.id_verification_pending",
          title: "New ID verification to review",
          body: `${profile.firstName} ${profile.lastName ?? ""} submitted their ID for verification.`,
          link: `/admin/identity-verifications?id=${profile.id}`,
          channels: ["IN_APP"],
          groupKey: `id-verify-${profile.id}`,
        });
      }
    } catch (err) {
      logger.warn({ err }, "[id-verify] admin notify failed");
    }

    revalidatePath("/me/profile");
    revalidatePath("/me/verify");
    return {
      ok: true,
      message: "Submitted. Admins typically review within 24 hours.",
    };
  } catch (err) {
    // Re-throw control-flow signals so Next.js can do its thing
    // (redirect to /signin if session expired mid-request, etc.).
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[id-verify] unhandled error");
    return {
      ok: false,
      message:
        "Something went wrong on our end. The team has been notified — please try again in a few minutes.",
    };
  }
}

/**
 * Withdraw a pending request. Does not unverify if already approved
 * (would be confusing — the verified status implies an approval that
 * the candidate shouldn't be able to silently revoke). Lets the
 * candidate cancel a still-pending submission and start over.
 */
export async function withdrawIDVerification(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const { session, profile } = await requireCandidate();
    if (profile.idVerificationStatus !== "PENDING") {
      return { ok: false, message: "Nothing to withdraw." };
    }
    await db.candidateProfile.update({
      where: { id: profile.id },
      data: {
        idVerificationStatus: "NONE",
        idVerificationDocUrl: null,
        idVerificationSubmittedAt: null,
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "id_verification.withdrawn",
        entity: "CandidateProfile",
        entityId: profile.id,
      });
    } catch (err) {
      logger.warn({ err }, "[id-verify] withdraw audit log failed");
    }
    revalidatePath("/me/verify");
    return { ok: true, message: "Withdrawn." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[id-verify] withdraw unhandled error");
    return {
      ok: false,
      message: "Couldn't withdraw — try again in a moment.",
    };
  }
}

// ─── Admin: review queue actions ────────────────────────────

const REVIEW_ACTION = z.enum(["approve", "reject", "bypass"]);

export async function reviewIDVerification(formData: FormData) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const profileId = z.string().parse(formData.get("profileId"));
  const action = REVIEW_ACTION.parse(formData.get("action"));
  const notes = String(formData.get("notes") ?? "").slice(0, 1000) || null;

  const profile = await db.candidateProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, firstName: true, idVerificationStatus: true },
  });
  if (!profile) redirect("/admin/identity-verifications?error=not-found");

  // "Bypass" lets the admin verify a trusted user without a document
  // upload — for power users / partners we KYC out-of-band. The flow
  // is identical to "approve" except the docUrl might be null. We
  // record it as a separate audit action so policy reviews can
  // distinguish doc-backed verifications from bypassed ones.
  const newStatus =
    action === "reject" ? "REJECTED" : "VERIFIED";

  await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      idVerificationStatus: newStatus,
      idVerificationReviewedAt: new Date(),
      idVerificationReviewedById: session.user!.id,
      idVerificationNotes: notes,
    },
  });

  await audit({
    actorId: session.user!.id,
    action:
      action === "reject"
        ? "id_verification.rejected"
        : action === "bypass"
          ? "id_verification.bypassed"
          : "id_verification.approved",
    entity: "CandidateProfile",
    entityId: profile.id,
    meta: { notes },
  });

  // Tell the candidate. Big moment for them either way.
  try {
    await dispatchNotification({
      userId: profile.userId,
      type:
        action === "reject"
          ? "candidate.id_verification_rejected"
          : "candidate.id_verification_approved",
      title:
        action === "reject"
          ? "Verification needs another look"
          : "You're verified ✓",
      body:
        action === "reject"
          ? notes ?? "Your ID couldn't be verified. You can re-submit a clearer image."
          : "Your profile now shows the blue verified badge across the platform.",
      link: "/me/verify",
      channels: ["IN_APP", "EMAIL"],
      groupKey: `id-verify-${profile.id}`,
    });
  } catch (err) {
    logger.warn({ err }, "[id-verify] result notify failed");
  }

  revalidatePath("/admin/identity-verifications");
  revalidatePath(`/me/profile`);
  revalidatePath("/feed");
}
