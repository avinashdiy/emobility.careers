import "server-only";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #1 Mutual-interest auto-thread.
 *
 * Premise: cold InMails get ignored because the recruiter is talking
 * to a candidate who never raised a hand. If we can detect both
 * sides have already raised a hand (candidate saved a company's job
 * + recruiter saved that candidate, or vice-versa), we auto-mint a
 * private thread with a system message that names the connection
 * for both sides. Conversion on warm threads beats cold InMail ~5×.
 *
 * Trigger points (both already exist):
 *   • `saveJob` (candidate side) → after the upsert, call
 *     `checkAndMintForCandidateSave({ candidateProfileId, jobId })`.
 *   • `saveCandidate` (recruiter side) → after the upsert, call
 *     `checkAndMintForRecruiterSave({ candidateId, employerUserId })`.
 *
 * Both helpers are best-effort: failures are logged but never
 * surface to the caller. The save itself must always succeed.
 */

/**
 * Candidate just saved a job. Check whether anyone at that job's
 * company has saved THIS candidate; if yes, mint the thread.
 */
export async function checkAndMintForCandidateSave({
  candidateProfileId,
  jobId,
}: {
  candidateProfileId: string;
  jobId: string;
}): Promise<void> {
  try {
    const job = await db.jobPosting.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, companyId: true, company: { select: { name: true } } },
    });
    if (!job) return;

    // Any employer at this company who has saved this candidate?
    // SavedCandidate doesn't carry a Prisma relation to User or
    // EmployerProfile (it stores employerUserId as a bare String),
    // so we can't filter via a nested where. Do it in two queries:
    // (a) all employer userIds at this company; (b) the longest-
    // saved row of this candidate whose employerUserId is in that
    // set. The team list is typically <20 ids — `in` is cheap.
    const teamUserIds = await db.employerProfile.findMany({
      where: { companyId: job.companyId },
      select: { userId: true },
    });
    if (teamUserIds.length === 0) return;
    const saved = await db.savedCandidate.findFirst({
      where: {
        candidateId: candidateProfileId,
        employerUserId: { in: teamUserIds.map((t) => t.userId) },
      },
      orderBy: { createdAt: "asc" },
      select: { employerUserId: true },
    });
    if (!saved) return;

    const candidate = await db.candidateProfile.findUnique({
      where: { id: candidateProfileId },
      select: { userId: true, firstName: true, lastName: true },
    });
    if (!candidate) return;

    await mintMutualInterestThread({
      candidateUserId: candidate.userId,
      employerUserId: saved.employerUserId,
      jobId: job.id,
      jobTitle: job.title,
      companyName: job.company.name,
      candidateFirstName: candidate.firstName,
    });
  } catch (err) {
    logger.warn(
      { err, candidateProfileId, jobId },
      "[mutual-interest] candidate-side check failed",
    );
  }
}

/**
 * Recruiter just saved a candidate. Check whether that candidate
 * has saved any of the recruiter's company's open jobs.
 */
export async function checkAndMintForRecruiterSave({
  candidateId,
  employerUserId,
}: {
  candidateId: string;
  employerUserId: string;
}): Promise<void> {
  try {
    const employer = await db.employerProfile.findUnique({
      where: { userId: employerUserId },
      select: { companyId: true, company: { select: { name: true } } },
    });
    if (!employer) return;

    // Has the candidate saved ANY of this company's currently-OPEN
    // jobs? If yes, pick the most recently saved one — that's the
    // freshest interest signal.
    const savedJob = await db.savedJob.findFirst({
      where: {
        candidateId,
        job: { companyId: employer.companyId, status: "OPEN" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        jobId: true,
        job: { select: { id: true, title: true } },
      },
    });
    if (!savedJob) return;

    const candidate = await db.candidateProfile.findUnique({
      where: { id: candidateId },
      select: { userId: true, firstName: true, lastName: true },
    });
    if (!candidate) return;

    await mintMutualInterestThread({
      candidateUserId: candidate.userId,
      employerUserId,
      jobId: savedJob.jobId,
      jobTitle: savedJob.job.title,
      companyName: employer.company.name,
      candidateFirstName: candidate.firstName,
    });
  } catch (err) {
    logger.warn(
      { err, candidateId, employerUserId },
      "[mutual-interest] recruiter-side check failed",
    );
  }
}

interface MintArgs {
  candidateUserId: string;
  employerUserId: string;
  jobId: string;
  jobTitle: string;
  companyName: string;
  candidateFirstName: string;
}

/**
 * The shared mint path. Idempotent — finds-or-creates a peer thread
 * (no `applicationId` because the candidate hasn't applied yet) for
 * this (employer, candidate) pair. If a thread already exists (e.g.
 * recruiter already cold-messaged), we DON'T mint a new one and we
 * DON'T post the system message — we want exactly one "you both
 * noticed each other" notification per pair.
 *
 * The unique constraint backing this no-duplicates guarantee is
 * `message_thread_peer_uniq` (partial unique index on
 * (employerUserId, candidateUserId) WHERE applicationId IS NULL —
 * see scripts/migrations/2026-05-message-thread-peer-uniq.sql).
 * Without that index applied, two concurrent calls here could race
 * and create duplicate threads — same TOCTOU pattern the migration
 * exists to prevent.
 */
async function mintMutualInterestThread(args: MintArgs): Promise<void> {
  const { candidateUserId, employerUserId, jobId, jobTitle, companyName, candidateFirstName } = args;

  // 1. Reuse existing thread if there is one. Either side may have
  // already started a conversation (cold InMail, an old application
  // that closed, etc.) — we shouldn't fork.
  const existing = await db.messageThread.findFirst({
    where: {
      candidateUserId,
      employerUserId,
      applicationId: null,
    },
    select: { id: true, source: true },
  });
  if (existing) {
    // If this thread already exists, the two sides are talking
    // (or have talked). Don't post a second "you both noticed
    // each other" greeting — it'd read as a system bug.
    return;
  }

  // 2. Create fresh thread + a single system-authored greeting
  // message. We treat the employer as the "sender" for now so the
  // recruiter's inbox surfaces it under their own activity.
  // Wrapped in a transaction so a partial-create (thread without
  // message) can't leak into the inbox.
  try {
    await db.$transaction(async (tx) => {
      const thread = await tx.messageThread.create({
        data: {
          candidateUserId,
          employerUserId,
          source: "MUTUAL_INTEREST",
          lastMessageAt: new Date(),
        },
      });

      const body = [
        `Looks like you've both noticed each other.`,
        ``,
        `${candidateFirstName} saved the ${jobTitle} role at ${companyName}, and the recruiting team has been tracking ${candidateFirstName}'s profile. We've opened this thread so the two of you can take it from here — no cold-pitch needed.`,
      ].join("\n");

      await tx.message.create({
        data: {
          threadId: thread.id,
          senderId: employerUserId,
          body,
        },
      });

      return thread;
    });
  } catch (err) {
    // Likely a unique-constraint violation from the partial index
    // (concurrent mint racing). Safe to swallow — the other path
    // already created the thread.
    logger.warn({ err, candidateUserId, employerUserId }, "[mutual-interest] thread mint failed");
    return;
  }

  // 3. Notify both sides via in-app notification, with a 30-day
  // groupKey dedup. `dispatchNotification`'s `groupKey` is just a
  // label — it does NOT prevent a second insert with the same key.
  // Without the dedup query below, a save/unsave/save cycle that
  // re-triggers the helper would re-fire the bell, even though the
  // thread already exists. The mirror pattern lives in
  // `server/profile/recruiter-peek.ts` — keeping behaviour
  // consistent across peer-notification surfaces.
  const groupKey = `mutual-${employerUserId}-${candidateUserId}`;
  const dedupSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const [candAlreadyPinged, recrAlreadyPinged] = await Promise.all([
      db.notification.findFirst({
        where: { userId: candidateUserId, groupKey, createdAt: { gte: dedupSince } },
        select: { id: true },
      }),
      db.notification.findFirst({
        where: { userId: employerUserId, groupKey, createdAt: { gte: dedupSince } },
        select: { id: true },
      }),
    ]);
    const dispatches: Promise<unknown>[] = [];
    if (!candAlreadyPinged) {
      dispatches.push(
        dispatchNotification({
          userId: candidateUserId,
          type: "mutual_interest.matched",
          title: `${companyName} noticed you`,
          body: `You both saved each other. New message in your inbox to take it from here.`,
          link: `/me/messages`,
          channels: ["IN_APP"],
          groupKey,
        }),
      );
    }
    if (!recrAlreadyPinged) {
      dispatches.push(
        dispatchNotification({
          userId: employerUserId,
          type: "mutual_interest.matched",
          title: `${candidateFirstName} just saved your job`,
          body: `${candidateFirstName} saved your "${jobTitle}" role. You'd already shown interest — new thread waiting in your inbox.`,
          link: `/employer/messages`,
          channels: ["IN_APP"],
          groupKey,
        }),
      );
    }
    if (dispatches.length > 0) await Promise.all(dispatches);
  } catch (err) {
    logger.warn({ err }, "[mutual-interest] notification dispatch failed");
  }
}
