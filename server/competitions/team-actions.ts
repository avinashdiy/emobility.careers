"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import { withUniqueSlug } from "@/lib/slug";
import { isRouterControlError } from "@/lib/server-action-errors";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { notificationsQueue } from "@/lib/queues";
import { s3, buckets, publicUrl, objectKey } from "@/lib/storage";
import type { FormState } from "@/lib/form-state";
import { optionalUrl } from "@/lib/forms/zod-url";

/**
 * Server actions for the Team EV Challenge feature.
 *
 * Lives alongside server/competitions/actions.ts but is the captain-
 * facing surface only — team profile editing, bulk member invites,
 * verification submission, page publish/hide. The original actions
 * file owns the host/admin/judge surfaces (createCompetitionDraft,
 * announceResults, etc) and the original `registerForCompetition`
 * flow which produces the bare CompetitionRegistration row this
 * feature then enriches.
 *
 * All actions in this file ownership-check on `leaderUserId`. Members
 * (non-captain) can only read; the captain is the sole admin until
 * captain-transfer ships in v2.
 *
 * Why these aren't in actions.ts: that file is already 800+ lines and
 * mixes host, candidate, judge, and admin actions. Splitting the
 * team-captain surface into its own module keeps each surface scoped
 * to one role.
 */

// ─── Helpers ────────────────────────────────────────────────────────

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

/**
 * Resolve a team the caller is allowed to administer. Throws via
 * redirect if the caller isn't the captain (leaderUserId). Returns
 * the team row with members + competition pre-fetched.
 */
async function resolveCaptainTeam(teamId: string, viewerId: string) {
  const team = await db.competitionRegistration.findUnique({
    where: { id: teamId },
    include: {
      competition: true,
      members: {
        orderBy: { invitedAt: "asc" },
        include: {
          // We carry user{ name, email } on each member so callers
          // (notifications, transfer, audit) can produce friendly
          // copy without a second roundtrip per row. Cheap because
          // most teams have <30 members.
          user: { select: { name: true, email: true } },
        },
      },
      leader: { select: { name: true, email: true } },
    },
  });
  if (!team) return null;
  if (team.leaderUserId !== viewerId) return null;
  return team;
}

// ─── createTeam — registration + team-profile in one go ─────────────

const CreateTeamSchema = z.object({
  competitionId: z.string().min(1),
  teamName: z.string().trim().min(2).max(80),
  institution: z.string().trim().max(200).optional(),
  /// Optional FK to canonical Institution table. Set when the
  /// captain picks from the InstitutionPicker autocomplete; empty
  /// when they typed free text.
  institutionId: z.string().optional().or(z.literal("")),
  externalEvent: z.string().trim().max(200).optional(),
  externalTeamId: z.string().trim().max(50).optional(),
  facultyAdvisor: z.string().trim().max(120).optional(),
  facultyEmail: z
    .string()
    .trim()
    .email("Faculty advisor email looks invalid.")
    .optional()
    .or(z.literal("")),
  teamBio: z.string().trim().max(2000).optional(),
});

export interface CreateTeamResult extends FormState {
  teamId?: string;
}

/**
 * Create a registration row + the captain's CompetitionTeamMember
 * + the team-profile fields (slug, college, external event) in one
 * transaction. Auto-generates a `teamSlug` from `teamName` via the
 * existing slug helper. Captain auto-becomes LEADER.
 *
 * The caller (the /competitions/[slug]/register page form) already
 * validates the competition exists + is LIVE; we re-check here as
 * defence-in-depth.
 */
export async function createTeam(
  _prev: CreateTeamResult,
  formData: FormData,
): Promise<CreateTeamResult> {
  try {
    const session = await requireUser();

    // Block accounts that haven't verified their email — the team
    // page goes public eventually and we want a real human owning it.
    const userRow = await db.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerifiedAt: true },
    });
    if (!userRow?.emailVerifiedAt) {
      return {
        ok: false,
        message:
          "Verify your email before creating a team — check the link in /me, then come back.",
      };
    }

    // Rate limit: 1 team-creation per (user, day). Stops a malicious
    // actor from spawning fake teams to inflate signups.
    const limit = await pgRateLimit({
      action: "competition.create_team",
      userId: session.user.id,
      opts: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    const parsed = CreateTeamSchema.safeParse({
      competitionId: formData.get("competitionId"),
      teamName: formData.get("teamName"),
      institution: formData.get("institution") || undefined,
      institutionId: formData.get("institutionId") || "",
      externalEvent: formData.get("externalEvent") || undefined,
      externalTeamId: formData.get("externalTeamId") || undefined,
      facultyAdvisor: formData.get("facultyAdvisor") || undefined,
      facultyEmail: formData.get("facultyEmail") || "",
      teamBio: formData.get("teamBio") || undefined,
    });
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ?? "Check the form and try again.",
      };
    }

    const comp = await db.competition.findUnique({
      where: { id: parsed.data.competitionId },
    });
    if (!comp) return { ok: false, message: "Competition not found." };
    if (comp.status !== "LIVE") {
      return { ok: false, message: "Registrations aren't open yet." };
    }
    const now = new Date();
    if (comp.registrationOpensAt && now < comp.registrationOpensAt) {
      return { ok: false, message: "Registration opens later — come back then." };
    }
    if (comp.registrationClosesAt && now > comp.registrationClosesAt) {
      return { ok: false, message: "Registration is closed for this challenge." };
    }
    if (!comp.isTeamBased) {
      return {
        ok: false,
        message: "This competition isn't team-based — register as solo on the competition page.",
      };
    }

    // Multi-team is allowed (the unique was dropped in 2026-05).
    // We DO still cap the number of teams a single user can lead in
    // a single competition — 5 — because beyond that it's almost
    // certainly an abuse pattern (someone spawning teams to inflate
    // signup metrics). If a real-world scenario ever needs more, an
    // admin override + audit row is the right escape hatch.
    const ledCount = await db.competitionRegistration.count({
      where: {
        competitionId: parsed.data.competitionId,
        leaderUserId: session.user.id,
      },
    });
    if (ledCount >= 5) {
      return {
        ok: false,
        message:
          "You've reached the per-user limit (5 teams) for this competition. Contact admin if you genuinely need more.",
      };
    }
    // Block obvious "exact same name twice" — captains who genuinely
    // want N teams should distinguish them, e.g. "Volt — Senior" vs
    // "Volt — Junior". Compare case-insensitive.
    const dupeName = await db.competitionRegistration.findFirst({
      where: {
        competitionId: parsed.data.competitionId,
        leaderUserId: session.user.id,
        teamName: { equals: parsed.data.teamName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (dupeName) {
      return {
        ok: false,
        message:
          "You already have a team with that exact name in this competition — pick something distinct.",
      };
    }

    // If the captain picked from the autocomplete, validate the FK
    // points at a real institution and back-fill the free-text
    // `institution` field with the canonical name. This keeps the
    // public team page render fast (no join needed when JIT-rendering
    // the institution badge) and ensures the displayed name matches
    // the curated entry rather than whatever the captain typed.
    let resolvedInstitutionId: string | null = parsed.data.institutionId || null;
    let resolvedInstitution: string | null = parsed.data.institution ?? null;
    if (resolvedInstitutionId) {
      const inst = await db.institution.findUnique({
        where: { id: resolvedInstitutionId },
        select: { id: true, name: true },
      });
      if (!inst) {
        // FK no longer valid (institution deleted). Demote to free text.
        resolvedInstitutionId = null;
      } else {
        resolvedInstitution = inst.name;
      }
    }

    // Create the registration + bump the competition's denormalised
    // counter in ONE transaction so a crash between the two can't
    // leave registrationsCount drifted from reality. The
    // withUniqueSlug retry loop wraps the whole transaction —
    // P2002 slug collisions roll back the transaction (counter
    // included) and retry with a fresh slug, so the counter only
    // increments when a row actually lands.
    const team = await withUniqueSlug(parsed.data.teamName, (slug) =>
      db.$transaction(async (tx) => {
        const created = await tx.competitionRegistration.create({
          data: {
            competitionId: parsed.data.competitionId,
            leaderUserId: session.user.id,
            teamName: parsed.data.teamName,
            teamSlug: slug,
            institution: resolvedInstitution,
            institutionId: resolvedInstitutionId,
            externalEvent: parsed.data.externalEvent ?? null,
            externalTeamId: parsed.data.externalTeamId ?? null,
            facultyAdvisor: parsed.data.facultyAdvisor ?? null,
            facultyEmail: parsed.data.facultyEmail || null,
            teamBio: parsed.data.teamBio ?? null,
            members: {
              create: {
                userId: session.user.id,
                role: "LEADER",
                status: "ACCEPTED",
                acceptedAt: new Date(),
              },
            },
          },
        });
        await tx.competition.update({
          where: { id: comp.id },
          data: { registrationsCount: { increment: 1 } },
        });
        return created;
      }),
    );
    await audit({
      actorId: session.user.id,
      action: "competition.team_created",
      entity: "CompetitionRegistration",
      entityId: team.id,
      meta: {
        competitionId: comp.id,
        teamName: parsed.data.teamName,
        institution: parsed.data.institution ?? null,
      },
    });

    revalidatePath(`/competitions/${comp.slug}`);
    return { ok: true, teamId: team.id };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] createTeam failed");
    return { ok: false, message: "Couldn't create the team. Try again." };
  }
}

// ─── updateTeam — captain edits team profile ────────────────────────

const UpdateTeamSchema = z.object({
  teamId: z.string(),
  teamName: z.string().trim().min(2).max(80),
  institution: z.string().trim().max(200).optional().or(z.literal("")),
  /// Optional canonical FK from the InstitutionPicker.
  institutionId: z.string().optional().or(z.literal("")),
  externalEvent: z.string().trim().max(200).optional().or(z.literal("")),
  externalTeamId: z.string().trim().max(50).optional().or(z.literal("")),
  facultyAdvisor: z.string().trim().max(120).optional().or(z.literal("")),
  facultyEmail: z
    .string()
    .trim()
    .email("Faculty advisor email looks invalid.")
    .optional()
    .or(z.literal("")),
  teamBio: z.string().trim().max(2000).optional().or(z.literal("")),
  // teamLogoUrl is intentionally NOT part of this schema — the
  // TeamLogoUploader owns logo lifecycle (upload & store URL in one
  // server action). Including it here would risk nulling the logo
  // every time the captain saves the profile.
  // Social links — flat fields on the form so the multipart parser
  // doesn't choke; we re-bundle into JSON before write.
  instagram: optionalUrl,
  linkedin: optionalUrl,
  website: optionalUrl,
  youtube: optionalUrl,
});

export async function updateTeam(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await requireUser();
    const parsed = UpdateTeamSchema.safeParse({
      teamId: formData.get("teamId"),
      teamName: formData.get("teamName"),
      institution: formData.get("institution") || "",
      institutionId: formData.get("institutionId") || "",
      externalEvent: formData.get("externalEvent") || "",
      externalTeamId: formData.get("externalTeamId") || "",
      facultyAdvisor: formData.get("facultyAdvisor") || "",
      facultyEmail: formData.get("facultyEmail") || "",
      teamBio: formData.get("teamBio") || "",
      instagram: formData.get("instagram") || "",
      linkedin: formData.get("linkedin") || "",
      website: formData.get("website") || "",
      youtube: formData.get("youtube") || "",
    });
    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Check the form.",
      };
    }
    const team = await resolveCaptainTeam(parsed.data.teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised to edit this team." };

    // Compose the socialLinks JSON. Drop empty keys so we don't store
    // "" for fields the captain didn't fill in.
    const socialLinks: Record<string, string> = {};
    if (parsed.data.instagram) socialLinks.instagram = parsed.data.instagram;
    if (parsed.data.linkedin) socialLinks.linkedin = parsed.data.linkedin;
    if (parsed.data.website) socialLinks.website = parsed.data.website;
    if (parsed.data.youtube) socialLinks.youtube = parsed.data.youtube;

    // Resolve the institution FK if supplied — same pattern as
    // createTeam: validate the FK exists, back-fill the free-text
    // field with the canonical name. Empty string means the captain
    // wants to clear the FK and keep only the free-text label.
    let resolvedInstitutionId: string | null = parsed.data.institutionId || null;
    let resolvedInstitution: string | null =
      parsed.data.institution || null;
    if (resolvedInstitutionId) {
      const inst = await db.institution.findUnique({
        where: { id: resolvedInstitutionId },
        select: { id: true, name: true },
      });
      if (!inst) {
        resolvedInstitutionId = null;
      } else {
        resolvedInstitution = inst.name;
      }
    }

    await db.competitionRegistration.update({
      where: { id: team.id },
      data: {
        teamName: parsed.data.teamName,
        institution: resolvedInstitution,
        institutionId: resolvedInstitutionId,
        externalEvent: parsed.data.externalEvent || null,
        externalTeamId: parsed.data.externalTeamId || null,
        facultyAdvisor: parsed.data.facultyAdvisor || null,
        facultyEmail: parsed.data.facultyEmail || null,
        teamBio: parsed.data.teamBio || null,
        // teamLogoUrl deliberately not in the data block — owned by
        // uploadTeamLogo, see schema comment.
        // Prisma's nullable Json column expects either an InputJsonValue
        // (an actual JSON object/array/string/number/boolean) or the
        // sentinel `Prisma.JsonNull`/`Prisma.DbNull`. A bare `null`
        // would write JSON-null literal value rather than DB NULL,
        // which is the wrong shape for "this user has no socials yet."
        socialLinks:
          Object.keys(socialLinks).length > 0 ? socialLinks : Prisma.JsonNull,
      },
    });
    revalidatePath(`/me/teams/${team.id}`);
    if (team.teamSlug && team.publicPageStatus === "PUBLISHED") {
      revalidatePath(`/teams/${team.teamSlug}`);
    }
    return { ok: true, message: "Saved." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] updateTeam failed");
    return { ok: false, message: "Couldn't save. Try again." };
  }
}

// ─── bulkInviteTeamMembers — paste 25 emails, one action ────────────

const BulkInviteSchema = z.object({
  teamId: z.string(),
  /// Free-text — we split on commas, semicolons, newlines, whitespace.
  /// Captain can also paste a CSV's email column.
  rawEmails: z.string().min(3).max(20_000),
});

export interface BulkInviteResult extends FormState {
  invited?: number;
  skippedExisting?: number;
  skippedInvalid?: string[];
  blockedByMaxSize?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bulkInviteTeamMembers(
  _prev: BulkInviteResult,
  formData: FormData,
): Promise<BulkInviteResult> {
  try {
    const session = await requireUser();
    const parsed = BulkInviteSchema.safeParse({
      teamId: formData.get("teamId"),
      rawEmails: formData.get("rawEmails"),
    });
    if (!parsed.success) {
      return { ok: false, message: "Paste at least one email." };
    }
    const team = await resolveCaptainTeam(parsed.data.teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };

    // Parse the textarea: split on any whitespace, commas, semicolons.
    // Lowercase + dedupe.
    const allTokens = parsed.data.rawEmails
      .split(/[\s,;]+/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const t of allTokens) {
      if (!seen.has(t)) {
        seen.add(t);
        unique.push(t);
      }
    }

    // Filter to valid email shape; collect invalid ones for a friendly
    // "we ignored: x, y, z" report.
    const valid: string[] = [];
    const skippedInvalid: string[] = [];
    for (const e of unique) {
      if (EMAIL_PATTERN.test(e)) valid.push(e);
      else skippedInvalid.push(e);
    }
    if (valid.length === 0) {
      return {
        ok: false,
        message: "No valid emails found.",
        skippedInvalid,
      };
    }

    // Don't re-invite emails already on the team (any status). The
    // (registrationId, invitedEmail) unique would catch this at the
    // DB level too, but a friendly count is better UX.
    const existingMembers = await db.competitionTeamMember.findMany({
      where: { registrationId: team.id },
      select: { invitedEmail: true, userId: true, user: { select: { email: true } } },
    });
    const existingEmails = new Set(
      existingMembers
        .flatMap((m) => [
          m.invitedEmail?.toLowerCase() ?? null,
          m.user?.email?.toLowerCase() ?? null,
        ])
        .filter((x): x is string => x !== null),
    );

    const toInvite: string[] = [];
    let skippedExisting = 0;
    for (const e of valid) {
      if (existingEmails.has(e)) {
        skippedExisting += 1;
      } else {
        toInvite.push(e);
      }
    }
    if (toInvite.length === 0) {
      return {
        ok: false,
        message: `Everyone you pasted is already on the team (${skippedExisting} duplicates).`,
        skippedExisting,
        skippedInvalid,
      };
    }

    // Enforce maxTeamSize from the Competition config (per-design
    // decision: no platform-level cap; use the host's setting).
    const maxSize = team.competition.maxTeamSize ?? 50;
    const currentCount = existingMembers.length;
    const remaining = Math.max(0, maxSize - currentCount);
    let blockedByMaxSize = 0;
    let willInvite = toInvite;
    if (toInvite.length > remaining) {
      blockedByMaxSize = toInvite.length - remaining;
      willInvite = toInvite.slice(0, remaining);
    }
    if (willInvite.length === 0) {
      return {
        ok: false,
        message: `Team is full (${currentCount}/${maxSize}). Remove someone before inviting more.`,
        blockedByMaxSize,
        skippedExisting,
        skippedInvalid,
      };
    }

    // Lookup whether each email already has a User row so we can
    // attach userId immediately. Saves a round-trip on accept.
    const existingUsers = await db.user.findMany({
      where: { email: { in: willInvite } },
      select: { id: true, email: true },
    });
    const userByEmail = new Map(
      existingUsers.map((u) => [u.email.toLowerCase(), u.id]),
    );

    // Create all invite rows in one $transaction so a partial failure
    // doesn't leave us with mismatched member counts.
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const inviteRows = await db.$transaction(
      willInvite.map((email) =>
        db.competitionTeamMember.create({
          data: {
            registrationId: team.id,
            invitedEmail: email,
            userId: userByEmail.get(email) ?? null,
            inviteToken: crypto.randomBytes(20).toString("hex"),
            inviteExpiresAt: expiresAt,
            role: "MEMBER",
            status: "INVITED",
          },
        }),
      ),
    );

    // Fan out the onboarding email per invite. Best-effort — a single
    // bad SES send shouldn't roll back the whole batch.
    const baseUrl = env.NEXT_PUBLIC_APP_URL;
    const captainName = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true },
    });
    for (const row of inviteRows) {
      const acceptUrl = `${baseUrl}/competitions/${team.competition.slug}/team-invite/${row.inviteToken}`;
      try {
        await sendMail({
          kind: "transactional",
          to: row.invitedEmail!,
          subject: `You're invited to ${team.teamName} for ${team.competition.title}`,
          html: buildInviteHtml({
            captainName: captainName?.name ?? "Your captain",
            teamName: team.teamName ?? "the team",
            competitionTitle: team.competition.title,
            externalEvent: team.externalEvent,
            institution: team.institution,
            acceptUrl,
          }),
          text: `${captainName?.name ?? "Your captain"} invited you to ${team.teamName ?? "their team"} on eMobility Careers for ${team.competition.title}. Accept here: ${acceptUrl}`,
        });
      } catch (err) {
        logger.warn({ err, email: row.invitedEmail }, "[team-actions] invite email send failed");
      }
      // Existing-user path: also push an in-app notification so they
      // see it next time they open the platform without checking
      // their email.
      if (row.userId) {
        await notificationsQueue
          .add("competition.team-invite", {
            userId: row.userId,
            type: "competition.team_invite",
            title: `You're invited to ${team.teamName ?? "a team"}`,
            body: `${captainName?.name ?? "A captain"} invited you to compete in ${team.competition.title}.`,
            link: acceptUrl,
            channels: ["IN_APP"],
            actorId: session.user.id,
          })
          .catch(() => undefined);
      }
    }

    await audit({
      actorId: session.user.id,
      action: "competition.team_bulk_invited",
      entity: "CompetitionRegistration",
      entityId: team.id,
      meta: {
        invited: willInvite.length,
        skippedExisting,
        skippedInvalid: skippedInvalid.length,
        blockedByMaxSize,
      },
    });

    revalidatePath(`/me/teams/${team.id}`);
    return {
      ok: true,
      message: `Invited ${willInvite.length} ${willInvite.length === 1 ? "person" : "people"}.`,
      invited: willInvite.length,
      skippedExisting,
      skippedInvalid: skippedInvalid.length > 0 ? skippedInvalid : undefined,
      blockedByMaxSize: blockedByMaxSize > 0 ? blockedByMaxSize : undefined,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] bulkInvite failed");
    return { ok: false, message: "Couldn't send invites. Try again." };
  }
}

/**
 * Onboarding email body — the v1 default. Plain, short, and honest:
 * who invited you, what the team is, what they're competing in, one
 * primary CTA. The email goes to fresh prospects so it doubles as
 * an introduction to the platform — keep the marketing-y bits to
 * the footer.
 */
function buildInviteHtml(o: {
  captainName: string;
  teamName: string;
  competitionTitle: string;
  externalEvent: string | null;
  institution: string | null;
  acceptUrl: string;
}): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const eventLine = o.externalEvent
    ? `<p style="color:#475569;margin:0 0 12px 0">They're preparing for <strong>${escape(o.externalEvent)}</strong>${o.institution ? ` at <strong>${escape(o.institution)}</strong>` : ""}.</p>`
    : o.institution
      ? `<p style="color:#475569;margin:0 0 12px 0">They're at <strong>${escape(o.institution)}</strong>.</p>`
      : "";
  return `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f5f7f5;padding:24px;margin:0">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:14px;overflow:hidden">
  <tr><td style="background:#374a47;padding:18px 22px;color:#c1ffb4">
    <strong style="font-size:18px">eMobility Careers</strong>
  </td></tr>
  <tr><td style="padding:24px">
    <h1 style="font-size:20px;color:#191919;margin:0 0 12px 0;line-height:1.3">
      ${escape(o.captainName)} invited you to ${escape(o.teamName)}
    </h1>
    <p style="color:#475569;margin:0 0 12px 0">
      You've been added to <strong>${escape(o.teamName)}</strong> for the
      <strong>${escape(o.competitionTitle)}</strong> challenge.
    </p>
    ${eventLine}
    <p style="margin:0 0 18px 0">
      <a href="${o.acceptUrl}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">
        Join the team →
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;margin:0">
      Click the link above to accept. If you don't have an eMobility Careers
      account yet, you'll create one in 30 seconds and land back on the team
      page. Invite expires in 14 days.
    </p>
  </td></tr>
</table>
</body></html>`;
}

// ─── revokeInvite — captain pulls a pending invite ──────────────────

export async function revokeTeamInvite(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const memberId = z.string().parse(formData.get("memberId"));
    const member = await db.competitionTeamMember.findUnique({
      where: { id: memberId },
      include: { registration: { select: { id: true, leaderUserId: true } } },
    });
    if (!member) return;
    if (member.registration.leaderUserId !== session.user.id) return;
    if (member.role === "LEADER") return; // can't revoke yourself
    if (member.status === "ACCEPTED") return; // use removeTeamMember instead
    await db.competitionTeamMember.delete({ where: { id: memberId } });
    revalidatePath(`/me/teams/${member.registration.id}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] revokeInvite failed");
  }
}

// ─── removeTeamMember — captain removes an accepted member ─────────

export async function removeTeamMember(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const memberId = z.string().parse(formData.get("memberId"));
    const member = await db.competitionTeamMember.findUnique({
      where: { id: memberId },
      include: { registration: { select: { id: true, leaderUserId: true } } },
    });
    if (!member) return;
    if (member.registration.leaderUserId !== session.user.id) return;
    if (member.role === "LEADER") return; // captain can't remove themselves
    await db.competitionTeamMember.update({
      where: { id: memberId },
      data: { status: "REMOVED" },
    });
    revalidatePath(`/me/teams/${member.registration.id}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] removeMember failed");
  }
}

// ─── updateMemberPosition — captain assigns role ───────────────────

export async function updateMemberPosition(formData: FormData): Promise<void> {
  try {
    const session = await requireUser();
    const memberId = z.string().parse(formData.get("memberId"));
    const positionTitle = z
      .string()
      .max(80)
      .parse(formData.get("positionTitle") ?? "")
      .trim();
    const member = await db.competitionTeamMember.findUnique({
      where: { id: memberId },
      include: { registration: { select: { id: true, leaderUserId: true } } },
    });
    if (!member) return;
    if (member.registration.leaderUserId !== session.user.id) return;
    await db.competitionTeamMember.update({
      where: { id: memberId },
      data: { positionTitle: positionTitle || null },
    });
    revalidatePath(`/me/teams/${member.registration.id}`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] updateMemberPosition failed");
  }
}

// ─── submitForVerification — captain → PENDING_REVIEW ──────────────

export async function submitTeamForVerification(formData: FormData): Promise<FormState> {
  try {
    const session = await requireUser();
    const teamId = z.string().parse(formData.get("teamId"));
    const team = await resolveCaptainTeam(teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };

    if (team.verificationStatus === "VERIFIED") {
      return { ok: false, message: "Already verified." };
    }
    if (team.verificationStatus === "PENDING_REVIEW") {
      return { ok: false, message: "Already submitted — admin is reviewing." };
    }

    // Sanity floor: faculty advisor + email + institution required
    // before review starts, otherwise admin has nothing to verify.
    if (!team.institution || !team.facultyAdvisor || !team.facultyEmail) {
      return {
        ok: false,
        message:
          "Add institution, faculty advisor name, and faculty email before submitting for verification.",
      };
    }

    await db.competitionRegistration.update({
      where: { id: team.id },
      data: { verificationStatus: "PENDING_REVIEW" },
    });

    // Faculty ping — courtesy email asking the advisor to confirm.
    // The link goes to /admin/teams (admin reads the response). v2
    // can build a proper one-click confirm/deny token flow.
    try {
      await sendMail({
        kind: "transactional",
        to: team.facultyEmail,
        subject: `Confirm your role as advisor for "${team.teamName}"`,
        html: `
          <p>Hi ${escapeHtml(team.facultyAdvisor)},</p>
          <p>${escapeHtml(team.leader?.name ?? "A student")} listed you as the
          faculty advisor for team <strong>${escapeHtml(team.teamName ?? "")}</strong>
          competing in <strong>${escapeHtml(team.competition.title)}</strong>
          ${team.externalEvent ? `(${escapeHtml(team.externalEvent)})` : ""}
          on eMobility Careers.</p>
          <p>If this is correct, you can ignore this email — verification
          will proceed automatically once an admin reviews. If you did NOT
          authorise this, please reply directly so we can investigate.</p>
          <p style="color:#94a3b8;font-size:12px">eMobility Careers · Verification</p>`,
        text: `${team.leader?.name ?? "A student"} listed you as faculty advisor for team "${team.teamName}" on eMobility Careers. If incorrect, reply to this email.`,
      });
    } catch (err) {
      // Non-fatal — admin can still verify without faculty's reply.
      logger.warn({ err }, "[team-actions] faculty ping failed");
    }

    await audit({
      actorId: session.user.id,
      action: "competition.team_submit_verification",
      entity: "CompetitionRegistration",
      entityId: team.id,
    });

    revalidatePath(`/me/teams/${team.id}`);
    revalidatePath(`/admin/teams`);
    return { ok: true, message: "Submitted for verification." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] submitForVerification failed");
    return { ok: false, message: "Couldn't submit. Try again." };
  }
}

// ─── publishTeamPage / hideTeamPage ────────────────────────────────

export async function publishTeamPage(formData: FormData): Promise<FormState> {
  try {
    const session = await requireUser();
    const teamId = z.string().parse(formData.get("teamId"));
    const team = await resolveCaptainTeam(teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };
    if (team.verificationStatus !== "VERIFIED") {
      return {
        ok: false,
        message: "Team must be VERIFIED before the public page can go live.",
      };
    }
    if (!team.teamSlug) {
      return { ok: false, message: "No team slug — re-save the profile." };
    }
    await db.competitionRegistration.update({
      where: { id: team.id },
      data: { publicPageStatus: "PUBLISHED", publishedAt: new Date() },
    });
    revalidatePath(`/me/teams/${team.id}`);
    revalidatePath(`/teams/${team.teamSlug}`);
    revalidatePath("/pulse");
    return { ok: true, message: "Team page published." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] publishTeamPage failed");
    return { ok: false, message: "Couldn't publish. Try again." };
  }
}

export async function hideTeamPage(formData: FormData): Promise<FormState> {
  try {
    const session = await requireUser();
    const teamId = z.string().parse(formData.get("teamId"));
    const team = await resolveCaptainTeam(teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };
    await db.competitionRegistration.update({
      where: { id: team.id },
      data: { publicPageStatus: "HIDDEN" },
    });
    revalidatePath(`/me/teams/${team.id}`);
    if (team.teamSlug) revalidatePath(`/teams/${team.teamSlug}`);
    return { ok: true, message: "Team page hidden." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] hideTeamPage failed");
    return { ok: false, message: "Couldn't hide page." };
  }
}

// ─── transferCaptaincy — hand the team over to a teammate ──────────

/**
 * Transfer team leadership to an existing ACCEPTED member. Atomic
 * via $transaction — the old captain becomes MEMBER, the new
 * captain becomes LEADER, and `Registration.leaderUserId` flips to
 * the new owner. Both parties are notified.
 *
 * Why this is captain-only (not admin-only): the captain is the
 * person closest to the team — they know who should take over if
 * they're stepping down. Admin override exists separately (admin
 * can flip leaderUserId via direct DB if a captain is unreachable);
 * we don't need a UI for that today.
 *
 * Guard rails:
 *   • New captain must be an ACCEPTED member of THIS team
 *   • New captain != current captain (refuses no-op)
 *   • Current captain becomes a regular MEMBER (not removed) so
 *     they keep visibility into the team they founded
 */
export async function transferCaptaincy(formData: FormData): Promise<FormState> {
  try {
    const session = await requireUser();
    const teamId = z.string().parse(formData.get("teamId"));
    const newCaptainUserId = z.string().parse(formData.get("newCaptainUserId"));

    const team = await resolveCaptainTeam(teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };

    if (newCaptainUserId === session.user.id) {
      return { ok: false, message: "You're already the captain." };
    }

    const newCaptainMember = team.members.find(
      (m) => m.userId === newCaptainUserId && m.status === "ACCEPTED",
    );
    if (!newCaptainMember) {
      return {
        ok: false,
        message: "That user isn't an accepted member of this team.",
      };
    }
    const oldCaptainMember = team.members.find(
      (m) => m.userId === session.user.id && m.role === "LEADER",
    );
    if (!oldCaptainMember) {
      // Defensive — shouldn't happen since resolveCaptainTeam already
      // gates on leaderUserId, but let's be explicit.
      return { ok: false, message: "Captain row not found." };
    }

    // Atomic: flip both member rows + the Registration.leaderUserId.
    // If any step fails the whole transaction reverts — we never
    // want a half-state where two LEADER rows exist.
    await db.$transaction([
      db.competitionTeamMember.update({
        where: { id: oldCaptainMember.id },
        data: { role: "MEMBER" },
      }),
      db.competitionTeamMember.update({
        where: { id: newCaptainMember.id },
        data: { role: "LEADER" },
      }),
      db.competitionRegistration.update({
        where: { id: team.id },
        data: { leaderUserId: newCaptainUserId },
      }),
    ]);

    await audit({
      actorId: session.user.id,
      action: "competition.team_captain_transferred",
      entity: "CompetitionRegistration",
      entityId: team.id,
      meta: {
        from: session.user.id,
        to: newCaptainUserId,
      },
    });

    // Notify both. The new captain gets the bigger nudge — they
    // need to know they're now responsible for submissions +
    // verification follow-up.
    const newCaptainName =
      newCaptainMember.user?.name ?? newCaptainMember.invitedEmail ?? "your teammate";
    await Promise.all([
      notificationsQueue
        .add("competition.captain-transfer-in", {
          userId: newCaptainUserId,
          type: "competition.captain_transferred",
          title: `You're now captain of ${team.teamName ?? "the team"}`,
          body: `${team.leader?.name ?? "The previous captain"} handed over leadership. You can now invite members, submit, and manage the team page.`,
          link: `/me/teams/${team.id}`,
          channels: ["IN_APP", "EMAIL"],
          actorId: session.user.id,
        })
        .catch(() => undefined),
      notificationsQueue
        .add("competition.captain-transfer-out", {
          userId: session.user.id,
          type: "competition.captain_transferred_to",
          title: `Captaincy transferred to ${newCaptainName}`,
          body: `You're now a regular member of ${team.teamName ?? "the team"}.`,
          link: `/me/teams/${team.id}`,
          channels: ["IN_APP"],
        })
        .catch(() => undefined),
    ]);

    revalidatePath(`/me/teams/${team.id}`);
    revalidatePath(`/me/teams`);
    return { ok: true, message: `Transferred to ${newCaptainName}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] transferCaptaincy failed");
    return { ok: false, message: "Couldn't transfer captaincy. Try again." };
  }
}

// ─── Admin verification actions ────────────────────────────────────

export async function adminVerifyTeam(formData: FormData): Promise<FormState> {
  try {
    const session = await requireAdmin();
    const teamId = z.string().parse(formData.get("teamId"));
    const decision = z.enum(["VERIFIED", "REJECTED"]).parse(formData.get("decision"));
    const note = z.string().max(2000).optional().parse(formData.get("note") ?? "");
    const team = await db.competitionRegistration.findUnique({
      where: { id: teamId },
      select: { id: true, leaderUserId: true, teamName: true, teamSlug: true },
    });
    if (!team) return { ok: false, message: "Team not found." };
    await db.competitionRegistration.update({
      where: { id: team.id },
      data: {
        verificationStatus: decision,
        verificationNote: note || null,
        verifiedAt: decision === "VERIFIED" ? new Date() : null,
        verifiedById: decision === "VERIFIED" ? session.user.id : null,
        // If we're rejecting and the page was somehow published, hide it.
        ...(decision === "REJECTED" ? { publicPageStatus: "HIDDEN" as const } : {}),
      },
    });
    await audit({
      actorId: session.user.id,
      action: decision === "VERIFIED" ? "competition.team_verified" : "competition.team_rejected",
      entity: "CompetitionRegistration",
      entityId: team.id,
      meta: { note: note || null },
    });
    // Notify the captain.
    await notificationsQueue
      .add("competition.team-verification", {
        userId: team.leaderUserId,
        type: "competition.team_verification",
        title:
          decision === "VERIFIED"
            ? `Your team "${team.teamName}" is verified`
            : `Your team "${team.teamName}" needs changes`,
        body:
          decision === "VERIFIED"
            ? "You can now publish the public team page from /me/teams."
            : note || "Admin requested changes — see /me/teams for details.",
        link: `/me/teams`,
        channels: ["IN_APP", "EMAIL"],
      })
      .catch(() => undefined);
    revalidatePath(`/admin/teams`);
    revalidatePath(`/admin/teams/${team.id}`);
    return { ok: true, message: `Team ${decision.toLowerCase()}.` };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] adminVerifyTeam failed");
    return { ok: false, message: "Couldn't update." };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── uploadTeamLogo — captain uploads + sharp auto-crops ────────────

const ALLOWED_LOGO_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB pre-resize cap
const LOGO_OUTPUT_SIZE = 512; // square output edge

/**
 * Captain uploads a team logo. Pipeline:
 *
 *   1. Validate MIME + magic bytes (defence in depth — content-type
 *      header is attacker-controlled).
 *   2. sharp() pipeline:
 *        rotate()        — apply EXIF rotation (phone uploads lose
 *                          orientation otherwise)
 *        resize(512x512) — fit:cover means it scales to fill the
 *                          square and crops the overflow, anchoring
 *                          to the centre. This is the "auto-crop"
 *                          piece — a 1920×1080 horizontal banner
 *                          gets centre-cropped to a tidy 512×512.
 *        webp({q:85})    — re-encode to WebP for ~30% smaller
 *                          payload than the source PNG/JPEG, with
 *                          near-lossless fidelity at q=85.
 *   3. PUT to MinIO (logos bucket, public-read ACL).
 *   4. Update CompetitionRegistration.teamLogoUrl + revalidate.
 *
 * Why server-side resize and not client crop UI: a crop UI is a v2
 * polish item; the auto-cropping handles 90% of real captain uploads
 * (square headshots, school crests with whitespace, etc.) without
 * any extra interaction. A captain who really cares about framing
 * uploads a pre-cropped image — auto-crop is a no-op for those.
 */
export async function uploadTeamLogo(formData: FormData): Promise<FormState & { url?: string }> {
  try {
    const session = await requireUser();
    const teamId = z.string().parse(formData.get("teamId"));
    const team = await resolveCaptainTeam(teamId, session.user.id);
    if (!team) return { ok: false, message: "Not authorised." };

    const file = formData.get("logo") as File | null;
    if (!file) return { ok: false, message: "No file received." };
    if (file.size === 0) return { ok: false, message: "Empty file." };
    if (file.size > MAX_LOGO_BYTES) {
      return { ok: false, message: "Logo must be under 5MB before resize." };
    }
    if (file.type && !ALLOWED_LOGO_MIMES.has(file.type)) {
      return { ok: false, message: "JPEG, PNG, WebP, or GIF only." };
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte sniff — trust nothing the browser claimed.
    const kind = sniffImageKind(inputBuffer);
    if (!kind) {
      return {
        ok: false,
        message: "File doesn't look like a real image (JPEG/PNG/WebP/GIF).",
      };
    }

    // sharp pipeline. The .rotate() call before resize is critical —
    // mobile photos carry orientation in EXIF and sharp doesn't
    // honour it by default, so without rotate() a portrait photo
    // would crop sideways.
    let outBuffer: Buffer;
    try {
      outBuffer = await sharp(inputBuffer, { animated: kind === "gif" })
        .rotate()
        .resize(LOGO_OUTPUT_SIZE, LOGO_OUTPUT_SIZE, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch (err) {
      logger.warn({ err, teamId }, "[team-actions] sharp resize failed");
      return {
        ok: false,
        message: "Couldn't process this image. Try a different file.",
      };
    }

    const key = objectKey(`team-logos/${team.id}`, "webp");
    await s3.send(
      new PutObjectCommand({
        Bucket: buckets.logos,
        Key: key,
        Body: outBuffer,
        ContentType: "image/webp",
        ACL: "public-read",
        // Defence in depth — even if a future caller bypasses the
        // server-side validation, browsers won't sniff a malicious
        // payload into something executable.
        Metadata: { "x-content-type-options": "nosniff" },
      }),
    );

    const url = publicUrl("logos", key);
    await db.competitionRegistration.update({
      where: { id: team.id },
      data: { teamLogoUrl: url },
    });
    await audit({
      actorId: session.user.id,
      action: "competition.team_logo_uploaded",
      entity: "CompetitionRegistration",
      entityId: team.id,
    });
    revalidatePath(`/me/teams/${team.id}`);
    if (team.teamSlug && team.publicPageStatus === "PUBLISHED") {
      revalidatePath(`/teams/${team.teamSlug}`);
    }
    return { ok: true, url };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[team-actions] uploadTeamLogo failed");
    return { ok: false, message: "Upload failed. Try again." };
  }
}

/**
 * Magic-byte sniff for the four allowed image formats. Mirrors the
 * helper in server/candidates/actions.ts but kept inline to avoid
 * a cross-module import for one tiny function.
 */
function sniffImageKind(buffer: Buffer): "jpeg" | "png" | "gif" | "webp" | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return "png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)
    return "gif";
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return "webp";
  return null;
}
