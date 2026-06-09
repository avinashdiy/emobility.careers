"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { evaluateFairEligibility } from "@/lib/fair-eligibility";

/**
 * Fair feature set #2 — attendee registration (separate from
 * applying to a job). #3 — on-site check-in code minted here, read
 * by the admin scanner UI. #4 — live booth chat helper (mints a
 * MessageThread with `source: "FAIR_LIVE_CHAT"`).
 *
 * All actions are auth-gated. Registration is rate-limited per user
 * via the "saveItem" preset so a stuck retry can't spam
 * registrations against multiple fairs.
 */

// 32-char alphabet, no I/O/0/1 — those are the characters most often
// misread at a busy reception desk. 6 chars from this set yields
// ~1.07e9 distinct codes, which is plenty for a long tail of fairs
// and a tiny collision probability at any individual fair (the
// unique column constraint will reject duplicates if it ever happens).
const CHECK_IN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function mintCheckInCode(): string {
  // crypto.randomInt is rejection-sampled so the modulo is unbiased.
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CHECK_IN_ALPHABET[crypto.randomInt(0, CHECK_IN_ALPHABET.length)];
  }
  return out;
}

const RegisterSchema = z.object({
  driveId: z.string().min(1),
  intentNote: z.string().trim().max(300).optional(),
});

/**
 * Candidate registers to attend a fair. Idempotent — the
 * `@@unique([driveId, candidateId])` constraint backstops a double-
 * click and we catch P2002 to fall through cleanly to the existing
 * registration's pass page.
 */
export async function registerForDrive(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) {
      redirect("/signin?next=/fairs");
    }
    const parsed = RegisterSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/fairs?error=" + encodeURIComponent("Invalid registration request."));
    }
    const { driveId, intentNote } = parsed.data;

    try {
      await rateLimitOrThrow(`fair-reg:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect("/fairs?error=" + encodeURIComponent("You're registering very fast — try again in a moment."));
    }

    // Pull the profile WITH the fields the eligibility helper
    // needs — completeness, resume, phone — plus the User row's
    // emailVerifiedAt + phone fallback. One round-trip; the
    // helper then derives the gates.
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        profileCompleteness: true,
        resumeUrl: true,
        aiResumeUrl: true,
        phone: true,
        user: { select: { emailVerifiedAt: true, phone: true } },
      },
    });
    if (!profile) redirect("/onboarding");

    const drive = await db.recruitmentDrive.findUnique({
      where: { id: driveId },
      select: { id: true, slug: true, title: true, status: true, registrationClosesAt: true },
    });
    if (!drive) {
      redirect("/fairs?error=" + encodeURIComponent("Fair not found."));
    }
    if (drive.status === "DRAFT" || drive.status === "CANCELLED") {
      redirect("/fairs?error=" + encodeURIComponent("Registration isn't open for this fair."));
    }
    if (drive.status === "CLOSED") {
      redirect(
        `/fairs/${drive.slug}?error=` +
          encodeURIComponent("This fair has ended — registrations are closed."),
      );
    }
    if (drive.registrationClosesAt && drive.registrationClosesAt < new Date()) {
      redirect(
        `/fairs/${drive.slug}?error=` +
          encodeURIComponent("Registration for this fair has closed."),
      );
    }

    // Eligibility gate. Server-side enforcement is the source of
    // truth — the public fair page also surfaces the gaps so the
    // candidate never lands here surprised, but a tampered form
    // submission (DevTools edit / replay) still bounces.
    // Redirects to /me/profile?incomplete=fair&fairSlug=...&missing=...
    // so the profile editor (existing surface) can render a contextual
    // banner pointing back at the fair the candidate was trying
    // to register for.
    const eligibility = evaluateFairEligibility(
      {
        profileCompleteness: profile.profileCompleteness,
        resumeUrl: profile.resumeUrl,
        aiResumeUrl: profile.aiResumeUrl,
        phone: profile.phone,
      },
      profile.user,
    );
    if (!eligibility.ok) {
      const missingCsv = eligibility.missing.join(",");
      redirect(
        `/me/profile?incomplete=fair&fairSlug=${encodeURIComponent(drive.slug)}` +
          `&pct=${eligibility.completeness}&missing=${encodeURIComponent(missingCsv)}`,
      );
    }

    // Find-or-create via try-create-then-catch-P2002. A naive
    // findFirst+create races between two browser tabs / a double-
    // submit and would otherwise generate duplicate registrations
    // (caught only by the unique constraint, but with a worse
    // error path). The retry on P2002 yields the existing row.
    let checkInCode: string;
    try {
      // Up to 5 collision retries — at 1.07e9 distinct codes, the
      // probability of even 1 collision in 10k registrations is < 5%,
      // so retry-on-P2002 is the right escape valve.
      let attempt = 0;
      for (;;) {
        attempt++;
        const code = mintCheckInCode();
        try {
          // Atomic: the registration row + the public counter
          // increment must commit together. Previously these were
          // two separate awaits — a crash (or a connection drop on
          // the shared Postgres) between them left a registered
          // candidate whose count was never tallied, drifting the
          // admin dashboard's registeredCount permanently below the
          // true row count. The $transaction rolls back BOTH on any
          // error, so a checkInCode-collision retry can't leave a
          // phantom increment behind either.
          const created = await db.$transaction(async (tx) => {
            const reg = await tx.recruitmentDriveRegistration.create({
              data: {
                driveId: drive.id,
                candidateId: profile.id,
                checkInCode: code,
                intentNote: intentNote && intentNote.length > 0 ? intentNote : null,
                source: "DIRECT",
              },
              select: { checkInCode: true },
            });
            await tx.recruitmentDrive.update({
              where: { id: drive.id },
              data: { registeredCount: { increment: 1 } },
            });
            return reg;
          });
          checkInCode = created.checkInCode;
          break;
        } catch (err) {
          const code = (err as { code?: string; meta?: { target?: string[] } })?.code;
          const target = (err as { meta?: { target?: string[] } })?.meta?.target ?? [];
          // Per-fair-per-candidate duplicate → user already
          // registered; just take them to their existing pass.
          if (code === "P2002" && target.includes("candidateId")) {
            const existing = await db.recruitmentDriveRegistration.findUnique({
              where: { driveId_candidateId: { driveId: drive.id, candidateId: profile.id } },
              select: { checkInCode: true },
            });
            if (existing) {
              checkInCode = existing.checkInCode;
              break;
            }
          }
          // Code-collision → retry with a fresh code.
          if (code === "P2002" && target.includes("checkInCode") && attempt < 6) {
            continue;
          }
          throw err;
        }
      }
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      logger.error({ err, driveId: drive.id }, "[fair-register] create failed");
      redirect(
        `/fairs/${drive.slug}?error=` +
          encodeURIComponent("Couldn't register — try again."),
      );
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "fair.registered",
        entity: "RecruitmentDrive",
        entityId: drive.id,
        meta: { source: "DIRECT" },
      });
    } catch {/* best-effort */}

    try {
      await dispatchNotification({
        userId: session.user.id,
        type: "fair.registered",
        title: `You're registered for ${drive.title}`,
        body: `Your fair pass + check-in code are ready. We'll remind you the day before.`,
        link: `/me/fairs/${drive.slug}/pass`,
        channels: ["IN_APP"],
        groupKey: `fair-reg-${drive.id}`,
      });
    } catch {/* best-effort */}

    revalidatePath(`/fairs/${drive.slug}`);
    redirect(`/me/fairs/${drive.slug}/pass?notice=` + encodeURIComponent("You're in! Save your check-in code."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-register] unexpected");
    redirect("/fairs?error=" + encodeURIComponent("Something went wrong — try again."));
  }
}

const CancelSchema = z.object({ driveId: z.string().min(1) });

/**
 * Candidate cancels their registration. Doesn't hard-delete so we
 * retain the audit trail + counter integrity ("X registered, 3
 * cancelled before the day").
 */
export async function cancelDriveRegistration(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    const parsed = CancelSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/me");

    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!profile) redirect("/onboarding");

    const drive = await db.recruitmentDrive.findUnique({
      where: { id: parsed.data.driveId },
      select: { id: true, slug: true },
    });
    if (!drive) redirect("/fairs");

    // Atomic: flip the row to CANCELLED and roll back the public
    // counter in one transaction. The conditional decrement (only
    // when a row actually flipped) lives inside the transaction so a
    // crash between the updateMany and the decrement can't leave a
    // CANCELLED registration still counted in registeredCount.
    await db.$transaction(async (tx) => {
      const result = await tx.recruitmentDriveRegistration.updateMany({
        where: {
          driveId: drive.id,
          candidateId: profile.id,
          status: "REGISTERED",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
      if (result.count > 0) {
        await tx.recruitmentDrive.update({
          where: { id: drive.id },
          data: { registeredCount: { decrement: 1 } },
        });
      }
    });

    revalidatePath(`/fairs/${drive.slug}`);
    redirect(
      `/fairs/${drive.slug}?notice=` +
        encodeURIComponent("Registration cancelled. You can re-register anytime before the fair starts."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-cancel] unexpected");
    redirect("/me");
  }
}

const CheckInSchema = z.object({
  driveId: z.string().min(1),
  // Accept either the raw 6-char code OR a "fair:<code>" prefix
  // (which lets future QR generators encode the fair scope inline
  // without breaking the manual-entry path).
  code: z.string().trim().min(6).max(60),
});

/**
 * Admin (or fair-staff) marks a candidate as checked-in at the
 * venue. Looks up the registration by code, scoped to the fair to
 * prevent code reuse leaking across events. Idempotent — second
 * check-in on the same registration is a no-op.
 */
export async function checkInRegistration(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      redirect("/403");
    }
    const parsed = CheckInSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/fairs?error=" + encodeURIComponent("Bad check-in request."));
    }
    const cleaned = parsed.data.code.toUpperCase().replace(/^FAIR:/i, "").trim();

    const reg = await db.recruitmentDriveRegistration.findUnique({
      where: { checkInCode: cleaned },
      select: {
        id: true,
        driveId: true,
        status: true,
        candidate: { select: { firstName: true, lastName: true } },
        drive: { select: { slug: true } },
      },
    });
    if (!reg || reg.driveId !== parsed.data.driveId) {
      redirect(
        `/admin/fairs/${parsed.data.driveId}/check-in?error=` +
          encodeURIComponent("Code not found for this fair."),
      );
    }
    if (reg.status === "CANCELLED") {
      redirect(
        `/admin/fairs/${parsed.data.driveId}/check-in?error=` +
          encodeURIComponent("Candidate cancelled their registration."),
      );
    }
    if (reg.status === "CHECKED_IN") {
      redirect(
        `/admin/fairs/${parsed.data.driveId}/check-in?notice=` +
          encodeURIComponent(`${reg.candidate.firstName} was already checked in.`),
      );
    }

    await db.recruitmentDriveRegistration.update({
      where: { id: reg.id },
      data: {
        status: "CHECKED_IN",
        checkedInAt: new Date(),
        checkedInById: session.user.id,
      },
    });
    await db.recruitmentDrive.update({
      where: { id: parsed.data.driveId },
      data: { checkedInCount: { increment: 1 } },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "fair.checked_in",
        entity: "RecruitmentDriveRegistration",
        entityId: reg.id,
        meta: { driveId: parsed.data.driveId },
      });
    } catch {/* best-effort */}

    revalidatePath(`/admin/fairs/${parsed.data.driveId}/check-in`);
    redirect(
      `/admin/fairs/${parsed.data.driveId}/check-in?notice=` +
        encodeURIComponent(
          `✓ ${reg.candidate.firstName} ${reg.candidate.lastName ?? ""} checked in.`,
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-checkin] unexpected");
    redirect("/admin/fairs");
  }
}

const LiveChatSchema = z.object({
  driveCompanyId: z.string().min(1),
});

/**
 * Candidate clicks "Chat live with us" on a booth card while the
 * fair is `IN_PROGRESS`. Mints a peer MessageThread between the
 * candidate and the FIRST CONFIRMED recruiter at the company (the
 * booth owner — usually the team's primary recruiter). Tagged with
 * `source: "FAIR_LIVE_CHAT"` so the recruiter's inbox can prioritise
 * + group fair-day messages.
 *
 * Idempotent: re-clicking opens the existing thread rather than
 * spawning a new one.
 */
export async function startLiveBoothChat(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");

    const parsed = LiveChatSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/fairs");

    // Throttle to "saveItem" preset — same shape as other peer-
    // messaging mints; prevents a candidate from spamming every
    // booth on the floor in a tight loop.
    try {
      await rateLimitOrThrow(`fair-chat:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      redirect("/fairs?error=" + encodeURIComponent("Slow down — try again in a moment."));
    }

    const booth = await db.recruitmentDriveCompany.findUnique({
      where: { id: parsed.data.driveCompanyId },
      select: {
        id: true,
        status: true,
        companyId: true,
        company: { select: { name: true } },
        drive: { select: { id: true, slug: true, status: true, title: true } },
      },
    });
    if (!booth || booth.status !== "CONFIRMED") {
      redirect("/fairs?error=" + encodeURIComponent("That booth isn't accepting live chats."));
    }
    if (booth.drive.status !== "IN_PROGRESS") {
      redirect(
        `/fairs/${booth.drive.slug}?error=` +
          encodeURIComponent("Live chat is only open while the fair is in progress."),
      );
    }

    // Pick the company's primary recruiter — first verified
    // employer at the company. v1 routes to a single recruiter to
    // keep responsibility clear; a future "booth team inbox" can
    // round-robin or fan-out to every team member.
    const employer = await db.employerProfile.findFirst({
      where: { companyId: booth.companyId },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (!employer) {
      redirect(
        `/fairs/${booth.drive.slug}?error=` +
          encodeURIComponent("No recruiter is staffing this booth — try another."),
      );
    }

    // Canonicalize the peer thread pair the same way mintConnectThread
    // does in server/networking/actions.ts — pick the lexicographically
    // smaller userId as the `employerUserId` so the partial unique
    // index `(employerUserId, candidateUserId) WHERE applicationId IS
    // NULL` deduplicates regardless of who initiated.
    const senderUserId = session.user.id;
    const recipientUserId = employer.userId;
    const [lowerUserId, higherUserId] = senderUserId < recipientUserId
      ? [senderUserId, recipientUserId]
      : [recipientUserId, senderUserId];

    let threadId: string;
    const existing = await db.messageThread.findFirst({
      where: {
        employerUserId: lowerUserId,
        candidateUserId: higherUserId,
        applicationId: null,
      },
      select: { id: true },
    });
    if (existing) {
      threadId = existing.id;
    } else {
      const thread = await db.messageThread.create({
        data: {
          employerUserId: lowerUserId,
          candidateUserId: higherUserId,
          source: "FAIR_LIVE_CHAT",
          lastMessageAt: new Date(),
        },
      });
      threadId = thread.id;
    }

    // Opening message — candidate's intro line. Plain templated
    // text; the recruiter sees the source badge on their inbox so
    // they know this came from a live booth.
    await db.message.create({
      data: {
        threadId,
        senderId: senderUserId,
        body: `Hi! I'm at the ${booth.drive.title} fair — saw your booth (${booth.company.name}) and wanted to say hello. Open to a quick chat?`,
      },
    });
    await db.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: new Date() },
    });

    try {
      await dispatchNotification({
        userId: employer.userId,
        type: "fair.live_chat",
        title: `Live chat from your fair booth`,
        body: `Someone at the ${booth.drive.title} fair just walked up — open thread now.`,
        link: `/employer/messages`,
        channels: ["IN_APP"],
        // No groupKey dedup here — each live-chat is a distinct
        // conversation worth surfacing. The recruiter's "fair day"
        // inbox is the right surface to filter on, not the bell.
      });
    } catch {/* best-effort */}

    redirect(`/me/messages/${threadId}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-live-chat] unexpected");
    redirect("/fairs");
  }
}

const RosterRowSchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().trim().max(120).optional(),
});

/**
 * Admin uploads a parsed CSV array of `{ email, fullName? }`. For
 * each row we either find the existing user (by lower-cased email)
 * and register them, OR create a `RecruitmentDriveRegistration`
 * placeholder shape — actually, we can only create a registration
 * when a CandidateProfile exists. So:
 *   • Existing candidate user → create registration directly
 *     (source = ROSTER_IMPORT).
 *   • No existing user → record in `errorReport` so the admin sees
 *     "12 invitees don't have accounts yet — they'll need to sign
 *     up first, then we'll auto-register them on first sign-in".
 *
 * v1 doesn't yet auto-register on signup. A row in errorReport is
 * the honest failure mode — admin can email those candidates an
 * invite to sign up, OR a future signup-callback can scan for
 * pending roster rows by email and convert them.
 */
const RosterImportSchema = z.object({
  driveId: z.string().min(1),
  csvText: z.string().min(1).max(2 * 1024 * 1024),
});

export async function importDriveRoster(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") redirect("/403");

    const parsed = RosterImportSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/fairs?error=" + encodeURIComponent("Bad roster upload."));
    }

    const drive = await db.recruitmentDrive.findUnique({
      where: { id: parsed.data.driveId },
      select: { id: true, slug: true, title: true },
    });
    if (!drive) redirect("/admin/fairs?error=" + encodeURIComponent("Fair not found."));

    // Dynamic import — papaparse is sizeable and only this admin
    // path needs it.
    const Papa = (await import("papaparse")).default;
    const parsedCsv = Papa.parse<Record<string, string>>(parsed.data.csvText, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsedCsv.data ?? [];

    const errorReport: Array<{ row: number; email: string; reason: string }> = [];
    let registeredCount = 0;
    let invitedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      // Be liberal in column names — common spreadsheet exports
      // use "Email"/"email"/"E-mail"; same for the name column.
      const email = (raw.email ?? raw.Email ?? raw["E-mail"] ?? "").trim();
      const fullName = (raw.fullName ?? raw.name ?? raw.Name ?? "").trim();
      const rowParsed = RosterRowSchema.safeParse({ email, fullName });
      if (!rowParsed.success) {
        errorReport.push({
          row: i + 2, // +2 because header is row 1, data starts at row 2
          email,
          reason: "Invalid email format",
        });
        continue;
      }

      const user = await db.user.findUnique({
        where: { email: rowParsed.data.email },
        select: {
          id: true,
          candidateProfile: { select: { id: true } },
        },
      });
      if (!user || !user.candidateProfile) {
        // No candidate profile yet — record for manual follow-up.
        // A future signup hook could auto-register on first sign-in
        // if the row.email appears in any pending roster.
        errorReport.push({
          row: i + 2,
          email: rowParsed.data.email,
          reason: "No candidate account yet — send them an invite to sign up.",
        });
        invitedCount += 1;
        continue;
      }

      // Try to register. Existing registration → skip silently
      // (counter stays accurate via on-conflict no-op).
      // Hoisted before the tx closure — TS doesn't carry the
      // `!user.candidateProfile` guard's narrowing into a nested
      // function, so we capture the id where it's known non-null.
      const candidateProfileId = user.candidateProfile.id;
      try {
        // Atomic create + counter increment — same fix as the direct
        // register path. Per-row this prevents the bulk import from
        // leaving the counter ahead of the real row count if a write
        // fails (or the process is killed) partway through a large
        // CSV. A P2002 (duplicate) rolls the whole row's tx back, so
        // the counter is never bumped for a row that didn't insert.
        await db.$transaction(async (tx) => {
          await tx.recruitmentDriveRegistration.create({
            data: {
              driveId: drive.id,
              candidateId: candidateProfileId,
              checkInCode: mintCheckInCode(),
              source: "ROSTER_IMPORT",
            },
          });
          await tx.recruitmentDrive.update({
            where: { id: drive.id },
            data: { registeredCount: { increment: 1 } },
          });
        });
        registeredCount += 1;

        // Best-effort welcome notification — candidate sees the
        // fair land in their inbox without needing email config.
        try {
          await dispatchNotification({
            userId: user.id,
            type: "fair.registered",
            title: `You're registered for ${drive.title}`,
            body: `Your college / employer added you to the attendee list. Your fair pass is ready.`,
            link: `/me/fairs/${drive.slug}/pass`,
            channels: ["IN_APP"],
            groupKey: `fair-reg-${drive.id}`,
          });
        } catch {/* best-effort */}
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
          // Already registered — not an error, just a duplicate row
          // in the CSV. Silently skip.
          continue;
        }
        errorReport.push({
          row: i + 2,
          email: rowParsed.data.email,
          reason: "Database write failed.",
        });
      }
    }

    const report = await db.recruitmentDriveRosterImport.create({
      data: {
        driveId: drive.id,
        uploadedById: session.user.id,
        fileUrl: "",
        fileName: null,
        rowCount: rows.length,
        invitedCount,
        registeredCount,
        failedCount: errorReport.length,
        errorReport: errorReport.length > 0
          ? (errorReport as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        completedAt: new Date(),
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "fair.roster_imported",
        entity: "RecruitmentDriveRosterImport",
        entityId: report.id,
        meta: { driveId: drive.id, rows: rows.length, registered: registeredCount, failed: errorReport.length },
      });
    } catch {/* best-effort */}

    revalidatePath(`/admin/fairs/${drive.id}/roster`);
    redirect(
      `/admin/fairs/${drive.id}/roster?notice=` +
        encodeURIComponent(
          `Imported ${rows.length} rows: ${registeredCount} registered, ${invitedCount} need signup, ${errorReport.length} errors.`,
        ),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[fair-roster-import] unexpected");
    redirect("/admin/fairs?error=" + encodeURIComponent("Roster import failed — try again."));
  }
}

// ─── Phase 2 hybrid Recruitathon ─────────────────────────────────
//
// Three small mutators used by the candidate-side pass page + the
// new camera/mic test page to mark presence + readiness without
// going through the admin scanner flow.
//
// `markOnlineCheckedIn` — idempotent auto-check-in for ONLINE /
// HYBRID candidates who hit the pass page during the event window.
// Mirrors the physical scanner's `checkedInAt` set but leaves
// `checkedInById` null so the live console can split "scanner
// check-ins" (had an admin id) from "online check-ins" (null id +
// fairMode != OFFLINE).
//
// `pingPresence` — bumps lastActiveAt to now(). Called server-side
// on every pass-page render + by a 60-s client pinger while the
// page stays open. Combined with the >5-min window in the live
// console query, it gives a "currently active" headcount that
// captures only candidates with a tab actually open.
//
// `markInterviewReady` — set by the camera/mic self-test page after
// the candidate confirms their setup works. Surfaces a green-dot
// readiness indicator on the recruiter's online slot board.

async function resolveCallerRegistration(driveSlug: string): Promise<{
  registrationId: string;
  driveId: string;
  fairMode: "OFFLINE" | "ONLINE" | "HYBRID" | null;
  checkedInAt: Date | null;
  driveStartsAt: Date;
  driveEndsAt: Date;
} | null> {
  const session = await auth();
  if (!session?.user) return null;
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) return null;
  // Pull the drive + registration in one round-trip. Slug → drive
  // first; then the unique (drive, candidate) pair on registration.
  const drive = await db.recruitmentDrive.findUnique({
    where: { slug: driveSlug },
    select: { id: true, startsAt: true, endsAt: true },
  });
  if (!drive) return null;
  const reg = await db.recruitmentDriveRegistration.findUnique({
    where: {
      driveId_candidateId: { driveId: drive.id, candidateId: profile.id },
    },
    select: { id: true, fairMode: true, checkedInAt: true },
  });
  if (!reg) return null;
  return {
    registrationId: reg.id,
    driveId: drive.id,
    fairMode: reg.fairMode,
    checkedInAt: reg.checkedInAt,
    driveStartsAt: drive.startsAt,
    driveEndsAt: drive.endsAt,
  };
}

/**
 * Auto-check-in for an ONLINE / HYBRID candidate who's actively on
 * their pass page during the event window. Idempotent: if the
 * candidate is already checked in (by anyone, anywhere), no-op.
 * Outside the event window, no-op — we don't want a pre-event tab
 * accidentally marking the candidate "present" the week before.
 *
 * OFFLINE candidates are explicitly skipped — they have to be
 * physically scanned at the venue to count. (A HYBRID candidate
 * who's online today gets auto-checked-in; if they later show up
 * at the venue, the scanner becomes a no-op because checkedInAt
 * is already set — the existing scanner action handles this case.)
 */
export async function markOnlineCheckedIn(driveSlug: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await resolveCallerRegistration(driveSlug);
    if (!ctx) return { ok: false };
    if (ctx.fairMode === "OFFLINE") return { ok: false };
    if (ctx.checkedInAt) return { ok: true }; // already in — no-op
    const now = new Date();
    if (now < ctx.driveStartsAt || now > ctx.driveEndsAt) {
      return { ok: false }; // outside event window
    }
    await db.recruitmentDriveRegistration.update({
      where: { id: ctx.registrationId },
      data: {
        checkedInAt: now,
        // checkedInById stays null — that IS the "auto online" marker.
        status: "CHECKED_IN",
        lastActiveAt: now,
      },
    });
    try {
      await audit({
        action: "fair.online_check_in",
        entity: "RecruitmentDriveRegistration",
        entityId: ctx.registrationId,
        meta: { driveId: ctx.driveId, fairMode: ctx.fairMode },
      });
    } catch {/* best-effort */}
    return { ok: true };
  } catch (err) {
    logger.warn({ err, driveSlug }, "[fair] markOnlineCheckedIn failed");
    return { ok: false };
  }
}

/**
 * Presence bump. Called server-side on pass-page render AND by the
 * client-side pinger every 60 s while the page is open. Cheap
 * single-column update; we don't audit-log these (would flood the
 * audit table) — the value of `lastActiveAt` alone is the signal.
 */
export async function pingPresence(driveSlug: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await resolveCallerRegistration(driveSlug);
    if (!ctx) return { ok: false };
    await db.recruitmentDriveRegistration.update({
      where: { id: ctx.registrationId },
      data: { lastActiveAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    logger.warn({ err, driveSlug }, "[fair] pingPresence failed");
    return { ok: false };
  }
}

/**
 * Candidate completed the camera + mic self-test. Stamps
 * `interviewReadyAt` so the recruiter's slot board surfaces a
 * green-dot readiness indicator. Idempotent — re-running just
 * bumps the timestamp (signal: "tested again, still working").
 *
 * No event-window gate — a candidate can pre-test the night before
 * and the recruiter still sees the green dot the next day.
 */
export async function markInterviewReady(driveSlug: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await resolveCallerRegistration(driveSlug);
    if (!ctx) return { ok: false };
    const now = new Date();
    await db.recruitmentDriveRegistration.update({
      where: { id: ctx.registrationId },
      data: { interviewReadyAt: now, lastActiveAt: now },
    });
    try {
      await audit({
        action: "fair.interview_ready",
        entity: "RecruitmentDriveRegistration",
        entityId: ctx.registrationId,
        meta: { driveId: ctx.driveId, fairMode: ctx.fairMode },
      });
    } catch {/* best-effort */}
    revalidatePath(`/me/fairs/${driveSlug}/pass`);
    return { ok: true };
  } catch (err) {
    logger.warn({ err, driveSlug }, "[fair] markInterviewReady failed");
    return { ok: false };
  }
}

// ─── Phase 3 hybrid Recruitathon ─────────────────────────────────
//
// Connection-issue reporting + video intro upload — the
// "something went wrong" recovery surface for online candidates.

const ReportIssueSchema = z.object({
  driveSlug: z.string().min(1),
  slotId: z.string().min(1).optional(),
  message: z.string().trim().max(500).optional(),
});

/**
 * Candidate files an SOS from the pass page mid-event ("my video is
 * frozen", "Meet won't load", "they can't hear me"). Creates a
 * `FairConnectionIssue` row in OPEN state + notifies the fair's
 * primary admin via in-app + WhatsApp (where available).
 *
 * Rate-limited to prevent a stuck retry from spam-filing 20 issues
 * in 10 seconds. Idempotency window via the rate-limit bucket is
 * enough — we don't dedup on (registration, slot) explicitly so the
 * candidate CAN file two reports if the issue actually re-occurred.
 */
export async function reportConnectionIssue(input: {
  driveSlug: string;
  slotId?: string;
  message?: string;
}): Promise<{ ok: boolean; issueId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) return { ok: false, error: "Sign in first." };

    const parsed = ReportIssueSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    try {
      await rateLimitOrThrow(`fair-issue:${session.user.id}`, "saveItem");
    } catch (err) {
      if (isRouterControlError(err)) throw err;
      return { ok: false, error: "Too many reports — give us a moment to respond to the last one." };
    }

    const ctx = await resolveCallerRegistration(parsed.data.driveSlug);
    if (!ctx) return { ok: false, error: "You're not registered for this fair." };

    // Validate slotId — if provided, it must belong to this candidate.
    if (parsed.data.slotId) {
      const slot = await db.recruitmentDriveInterviewSlot.findUnique({
        where: { id: parsed.data.slotId },
        select: { candidateId: true, driveCompany: { select: { driveId: true } } },
      });
      const profile = await db.candidateProfile.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      });
      if (
        !slot ||
        slot.candidateId !== profile?.id ||
        slot.driveCompany.driveId !== ctx.driveId
      ) {
        return { ok: false, error: "That slot isn't yours." };
      }
    }

    const issue = await db.fairConnectionIssue.create({
      data: {
        registrationId: ctx.registrationId,
        slotId: parsed.data.slotId ?? null,
        message: parsed.data.message ?? null,
      },
      select: { id: true },
    });

    // Page the fair's primary admin via in-app + WhatsApp. We pick
    // the fair's `createdById` as the singular owner. For an event
    // with a dedicated ops team, the admin live console's "active
    // issues" rail surfaces all of these regardless of who got the
    // direct ping — so a dropped notification doesn't strand the
    // candidate.
    const drive = await db.recruitmentDrive.findUnique({
      where: { id: ctx.driveId },
      select: { id: true, slug: true, title: true, createdById: true },
    });
    if (drive) {
      try {
        await dispatchNotification({
          userId: drive.createdById,
          type: "fair.connection_issue",
          title: `⚠ Candidate reported a connection issue — ${drive.title}`,
          body:
            parsed.data.message
              ? `"${parsed.data.message.slice(0, 140)}"`
              : "No details — call them at the registered phone.",
          link: `/admin/recruitathon/${drive.slug}/live#issues`,
          channels: ["IN_APP", "WHATSAPP"],
          groupKey: `issue-${issue.id}`,
        });
      } catch {/* best-effort */}
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "fair.connection_issue_reported",
        entity: "FairConnectionIssue",
        entityId: issue.id,
        meta: { driveId: ctx.driveId, slotId: parsed.data.slotId },
      });
    } catch {/* best-effort */}

    revalidatePath(`/me/fairs/${parsed.data.driveSlug}/pass`);
    return { ok: true, issueId: issue.id };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.warn({ err }, "[fair] reportConnectionIssue failed");
    return { ok: false, error: "Couldn't file the report — try once more." };
  }
}

const ResolveIssueSchema = z.object({
  issueId: z.string().min(1),
  resolutionNote: z.string().trim().max(500).optional(),
});

/**
 * Admin marks an OPEN connection-issue as RESOLVED. Idempotent —
 * already-resolved issues are a no-op. Audit-logged.
 */
export async function resolveConnectionIssue(formData: FormData): Promise<void> {
  try {
    const session = await auth();
    if (!session?.user) redirect("/signin");
    if (session.user.role !== "ADMIN") redirect("/403");
    const parsed = ResolveIssueSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/recruitathon?error=" + encodeURIComponent("Invalid input."));
    }

    const issue = await db.fairConnectionIssue.findUnique({
      where: { id: parsed.data.issueId },
      select: {
        id: true,
        status: true,
        registration: { select: { drive: { select: { slug: true } } } },
      },
    });
    if (!issue) {
      redirect("/admin/recruitathon?error=" + encodeURIComponent("Issue not found."));
    }
    const driveSlug = issue.registration.drive.slug;

    if (issue.status === "RESOLVED") {
      // Idempotent — re-marking a resolved issue does nothing.
      redirect(`/admin/recruitathon/${driveSlug}/live?notice=` + encodeURIComponent("Already resolved."));
    }

    await db.fairConnectionIssue.update({
      where: { id: issue.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: session.user.id,
        resolutionNote: parsed.data.resolutionNote ?? null,
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "fair.connection_issue_resolved",
        entity: "FairConnectionIssue",
        entityId: issue.id,
        meta: { driveSlug },
      });
    } catch {/* best-effort */}

    revalidatePath(`/admin/recruitathon/${driveSlug}/live`);
    redirect(`/admin/recruitathon/${driveSlug}/live?notice=` + encodeURIComponent("Issue resolved."));
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.warn({ err }, "[fair] resolveConnectionIssue failed");
    redirect("/admin/recruitathon?error=" + encodeURIComponent("Couldn't resolve — try again."));
  }
}

// Video-intro upload limits — 50MB cap (2-min phone video at 720p
// lands well under this) and an allowlist of video MIME types we
// know browsers + MinIO handle cleanly. Bigger uploads would need
// the presigned-PUT path; for v1 stream through the server action.
const MAX_VIDEO_INTRO_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_INTRO_MIME = new Set<string>([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

/**
 * Async-fallback: candidate uploads a 2-min video intro that the
 * recruiter sees as a non-blocking review item. Useful when:
 *   • their interview slot got cancelled and they can't reschedule
 *   • they registered ONLINE but couldn't book a slot in time
 *   • they want to give the recruiter a face / voice before a
 *     written-only application is reviewed
 *
 * Files land in the `docs` (private) bucket. The candidate's own
 * fair pass shows them their upload; recruiters reading an
 * application from this fair see a "Watch video intro" CTA.
 */
export async function uploadFairVideoIntro(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const { putObject, objectKey } = await import("@/lib/storage");
  try {
    const session = await auth();
    if (!session?.user) return { ok: false, error: "Sign in first." };
    const driveSlug = z.string().min(1).parse(formData.get("driveSlug"));
    const file = formData.get("video") as File | null;
    if (!file || file.size === 0) return { ok: false, error: "Pick a file first." };
    if (file.size > MAX_VIDEO_INTRO_BYTES) {
      return { ok: false, error: "Video over 50 MB. Trim or compress and try again." };
    }
    if (!ALLOWED_VIDEO_INTRO_MIME.has(file.type)) {
      return { ok: false, error: "Use an MP4 / MOV / WebM video file." };
    }

    const ctx = await resolveCallerRegistration(driveSlug);
    if (!ctx) return { ok: false, error: "You're not registered for this fair." };

    const ext = (() => {
      const dot = file.name.lastIndexOf(".");
      if (dot < 0) return "mp4";
      const candidate = file.name.slice(dot + 1).toLowerCase();
      return /^[a-z0-9]{1,5}$/.test(candidate) ? candidate : "mp4";
    })();
    const key = objectKey(`fair-intros/${ctx.driveId}`, ext);
    const buffer = Buffer.from(await file.arrayBuffer());
    await putObject("docs", key, buffer, file.type);

    await db.recruitmentDriveRegistration.update({
      where: { id: ctx.registrationId },
      data: {
        videoIntroUrl: key,
        videoIntroUploadedAt: new Date(),
      },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "fair.video_intro_uploaded",
        entity: "RecruitmentDriveRegistration",
        entityId: ctx.registrationId,
        meta: { driveId: ctx.driveId, size: file.size, contentType: file.type },
      });
    } catch {/* best-effort */}

    revalidatePath(`/me/fairs/${driveSlug}/pass`);
    return { ok: true };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.warn({ err }, "[fair] uploadFairVideoIntro failed");
    return { ok: false, error: "Upload failed — try again." };
  }
}

/**
 * Server action that returns a presigned GET URL for a candidate's
 * video intro. Auth-gated — only the candidate themselves, an admin,
 * or a recruiter at a company that the candidate has applied to in
 * THIS fair can fetch the URL. URL is short-lived (5 min); the
 * candidate's pass page calls it on click, same pattern as the
 * messages-attachment download.
 */
export async function getFairVideoIntroUrl(
  registrationId: string,
): Promise<{ url: string | null }> {
  const { presignDownload } = await import("@/lib/storage");
  try {
    const session = await auth();
    if (!session?.user) return { url: null };
    const reg = await db.recruitmentDriveRegistration.findUnique({
      where: { id: registrationId },
      select: {
        videoIntroUrl: true,
        candidateId: true,
        driveId: true,
        candidate: { select: { userId: true } },
      },
    });
    if (!reg?.videoIntroUrl) return { url: null };

    // Self, admin, OR recruiter at a company the candidate has applied to
    // (via a JobPosting attached to this fair).
    if (session.user.role !== "ADMIN" && reg.candidate.userId !== session.user.id) {
      const employer = await db.employerProfile.findUnique({
        where: { userId: session.user.id },
        select: { companyId: true },
      });
      if (!employer) return { url: null };
      const app = await db.application.findFirst({
        where: {
          candidateId: reg.candidateId,
          job: {
            companyId: employer.companyId,
            recruitmentDriveJobs: { some: { driveId: reg.driveId } },
          },
        },
        select: { id: true },
      });
      if (!app) return { url: null };
    }

    const url = await presignDownload("docs", reg.videoIntroUrl, 60 * 5, {
      inline: true,
      contentType: "video/mp4",
    });
    return { url };
  } catch (err) {
    logger.warn({ err, registrationId }, "[fair] getFairVideoIntroUrl failed");
    return { url: null };
  }
}
