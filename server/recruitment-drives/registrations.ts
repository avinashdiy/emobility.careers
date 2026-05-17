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
          const created = await db.recruitmentDriveRegistration.create({
            data: {
              driveId: drive.id,
              candidateId: profile.id,
              checkInCode: code,
              intentNote: intentNote && intentNote.length > 0 ? intentNote : null,
              source: "DIRECT",
            },
            select: { checkInCode: true },
          });
          checkInCode = created.checkInCode;
          await db.recruitmentDrive.update({
            where: { id: drive.id },
            data: { registeredCount: { increment: 1 } },
          });
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

    const result = await db.recruitmentDriveRegistration.updateMany({
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
      // Roll back the public counter — only when we actually
      // flipped a row from REGISTERED to CANCELLED.
      await db.recruitmentDrive.update({
        where: { id: drive.id },
        data: { registeredCount: { decrement: 1 } },
      });
    }

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
      try {
        await db.recruitmentDriveRegistration.create({
          data: {
            driveId: drive.id,
            candidateId: user.candidateProfile.id,
            checkInCode: mintCheckInCode(),
            source: "ROSTER_IMPORT",
          },
        });
        await db.recruitmentDrive.update({
          where: { id: drive.id },
          data: { registeredCount: { increment: 1 } },
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
