"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { withUniqueSlug } from "@/lib/slug";
import { notificationsQueue } from "@/lib/queues";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/form-state";
import { isRouterControlError } from "@/lib/server-action-errors";
import { logger } from "@/lib/logger";
import { zodErrorsToFieldErrors } from "@/lib/form-state";

async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return session;
}

async function assertHostsCompany(userId: string, companyId: string) {
  const company = await db.company.findFirst({
    where: {
      id: companyId,
      OR: [
        { ownerUserId: userId },
        { team: { some: { userId } } },
      ],
    },
  });
  if (!company) throw new Error("Not authorised to host on this company.");
  return company;
}

async function assertCanEditCompetition(userId: string, competitionId: string) {
  const c = await db.competition.findFirst({
    where: {
      id: competitionId,
      OR: [
        { postedById: userId },
        { hostCompany: { ownerUserId: userId } },
        { hostCompany: { team: { some: { userId } } } },
      ],
    },
  });
  if (!c) throw new Error("Not authorised.");
  return c;
}

// ─── Host-side: create / draft competitions ─────────────────

const CompetitionDraftSchema = z.object({
  hostCompanyId: z.string().min(1),
  title: z.string().min(8).max(160),
  tagline: z.string().max(200).optional(),
  description: z.string().min(50).max(20000),
  type: z.enum(["HACKATHON", "CASE_STUDY", "QUIZ", "DESIGN_CHALLENGE", "INNOVATION", "INTERNSHIP_HUNT", "IDEATHON", "RESEARCH"]),
  evDomainSlugs: z.array(z.string()).max(10).default([]),
  bannerImageUrl: z.string().url().optional().or(z.literal("")),
  eligibility: z.string().max(2000).optional(),
  rules: z.string().max(20000).optional(),
  isTeamBased: z.coerce.boolean().default(false),
  // Cap raised from 20 → 50 in 2026-05 to support 25-person eBAJA
  // teams and similar large-format events. The Competition host
  // tunes the actual cap per-competition; the schema's job is just
  // to refuse absurd values.
  minTeamSize: z.coerce.number().int().min(1).max(50).optional(),
  maxTeamSize: z.coerce.number().int().min(1).max(50).optional(),
  registrationOpensAt: z.coerce.date().optional(),
  registrationClosesAt: z.coerce.date().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  resultsAt: z.coerce.date().optional(),
  totalPrizePoolMinor: z.coerce.number().int().min(0).default(0),
  prizeCurrency: z.string().default("INR"),
});

export async function createCompetitionDraft(_prev: FormState & { id?: string }, formData: FormData): Promise<FormState & { id?: string }> {
  const session = await requireUser();
  const parsed = CompetitionDraftSchema.safeParse({
    hostCompanyId: formData.get("hostCompanyId"),
    title: formData.get("title"),
    tagline: formData.get("tagline") || undefined,
    description: formData.get("description"),
    type: formData.get("type"),
    evDomainSlugs: formData.getAll("evDomainSlugs").map(String).filter(Boolean),
    bannerImageUrl: formData.get("bannerImageUrl") || undefined,
    eligibility: formData.get("eligibility") || undefined,
    rules: formData.get("rules") || undefined,
    isTeamBased: formData.get("isTeamBased"),
    minTeamSize: formData.get("minTeamSize") || undefined,
    maxTeamSize: formData.get("maxTeamSize") || undefined,
    registrationOpensAt: formData.get("registrationOpensAt") || undefined,
    registrationClosesAt: formData.get("registrationClosesAt") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    resultsAt: formData.get("resultsAt") || undefined,
    totalPrizePoolMinor: formData.get("totalPrizePoolMinor") || 0,
    prizeCurrency: formData.get("prizeCurrency") || "INR",
  });
  if (!parsed.success) {
    return { ok: false, message: "Please fix the errors below.", fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  }
  await assertHostsCompany(session.user.id, parsed.data.hostCompanyId);
  if (parsed.data.endsAt <= parsed.data.startsAt) {
    return { ok: false, message: "End must be after start." };
  }
  if (parsed.data.isTeamBased && (!parsed.data.minTeamSize || !parsed.data.maxTeamSize)) {
    return { ok: false, message: "Set min and max team size." };
  }

  const created = await withUniqueSlug(parsed.data.title, (slug) =>
    db.competition.create({
      data: {
        slug,
        title: parsed.data.title,
        tagline: parsed.data.tagline,
        description: parsed.data.description,
        type: parsed.data.type,
        evDomainSlugs: parsed.data.evDomainSlugs,
        bannerImageUrl: parsed.data.bannerImageUrl || null,
        eligibility: parsed.data.eligibility,
        rules: parsed.data.rules,
        isTeamBased: parsed.data.isTeamBased,
        minTeamSize: parsed.data.isTeamBased ? parsed.data.minTeamSize ?? 1 : null,
        maxTeamSize: parsed.data.isTeamBased ? parsed.data.maxTeamSize ?? 4 : null,
        registrationOpensAt: parsed.data.registrationOpensAt,
        registrationClosesAt: parsed.data.registrationClosesAt,
        startsAt: parsed.data.startsAt,
        endsAt: parsed.data.endsAt,
        resultsAt: parsed.data.resultsAt,
        totalPrizePoolMinor: parsed.data.totalPrizePoolMinor,
        prizeCurrency: parsed.data.prizeCurrency,
        hostCompanyId: parsed.data.hostCompanyId,
        postedById: session.user.id,
        status: "DRAFT",
      },
    }),
  );
  await audit({
    actorId: session.user.id,
    action: "competition.draft",
    entity: "Competition",
    entityId: created.id,
  });
  revalidatePath("/employer/competitions");
  return { ok: true, id: created.id };
}

export async function updateCompetitionDraft(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  await assertCanEditCompetition(session.user.id, id);
  const parsed = CompetitionDraftSchema.safeParse({
    hostCompanyId: formData.get("hostCompanyId"),
    title: formData.get("title"),
    tagline: formData.get("tagline") || undefined,
    description: formData.get("description"),
    type: formData.get("type"),
    evDomainSlugs: formData.getAll("evDomainSlugs").map(String).filter(Boolean),
    bannerImageUrl: formData.get("bannerImageUrl") || undefined,
    eligibility: formData.get("eligibility") || undefined,
    rules: formData.get("rules") || undefined,
    isTeamBased: formData.get("isTeamBased"),
    minTeamSize: formData.get("minTeamSize") || undefined,
    maxTeamSize: formData.get("maxTeamSize") || undefined,
    registrationOpensAt: formData.get("registrationOpensAt") || undefined,
    registrationClosesAt: formData.get("registrationClosesAt") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    resultsAt: formData.get("resultsAt") || undefined,
    totalPrizePoolMinor: formData.get("totalPrizePoolMinor") || 0,
    prizeCurrency: formData.get("prizeCurrency") || "INR",
  });
  if (!parsed.success) return { ok: false, message: "Invalid input.", fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  await db.competition.update({
    where: { id },
    data: {
      title: parsed.data.title,
      tagline: parsed.data.tagline,
      description: parsed.data.description,
      type: parsed.data.type,
      evDomainSlugs: parsed.data.evDomainSlugs,
      bannerImageUrl: parsed.data.bannerImageUrl || null,
      eligibility: parsed.data.eligibility,
      rules: parsed.data.rules,
      isTeamBased: parsed.data.isTeamBased,
      minTeamSize: parsed.data.isTeamBased ? parsed.data.minTeamSize ?? 1 : null,
      maxTeamSize: parsed.data.isTeamBased ? parsed.data.maxTeamSize ?? 4 : null,
      registrationOpensAt: parsed.data.registrationOpensAt,
      registrationClosesAt: parsed.data.registrationClosesAt,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      resultsAt: parsed.data.resultsAt,
      totalPrizePoolMinor: parsed.data.totalPrizePoolMinor,
      prizeCurrency: parsed.data.prizeCurrency,
    },
  });
  revalidatePath(`/employer/competitions/${id}`);
  return { ok: true, message: "Saved." };
}

const StageSchema = z.object({
  competitionId: z.string(),
  name: z.string().min(2).max(120),
  description: z.string().max(4000).optional(),
  kind: z.enum(["REGISTRATION", "QUIZ", "SUBMISSION", "INTERVIEW", "PRESENTATION"]),
  assessmentId: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  advanceTopN: z.coerce.number().int().min(1).optional(),
  advanceMinScore: z.coerce.number().min(0).optional(),
});

export async function addCompetitionStage(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = StageSchema.safeParse({
    competitionId: formData.get("competitionId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    kind: formData.get("kind"),
    assessmentId: formData.get("assessmentId") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    advanceTopN: formData.get("advanceTopN") || undefined,
    advanceMinScore: formData.get("advanceMinScore") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid stage." };
  await assertCanEditCompetition(session.user.id, parsed.data.competitionId);
  const lastOrder = await db.competitionStage.findFirst({
    where: { competitionId: parsed.data.competitionId },
    orderBy: { order: "desc" },
  });
  await db.competitionStage.create({
    data: {
      competitionId: parsed.data.competitionId,
      order: (lastOrder?.order ?? 0) + 1,
      name: parsed.data.name,
      description: parsed.data.description,
      kind: parsed.data.kind,
      assessmentId: parsed.data.assessmentId,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      advanceTopN: parsed.data.advanceTopN,
      advanceMinScore: parsed.data.advanceMinScore,
    },
  });
  revalidatePath(`/employer/competitions/${parsed.data.competitionId}`);
  return { ok: true };
}

export async function deleteCompetitionStage(stageId: string): Promise<FormState> {
  const session = await requireUser();
  const stage = await db.competitionStage.findUnique({ where: { id: stageId } });
  if (!stage) return { ok: false, message: "Not found." };
  await assertCanEditCompetition(session.user.id, stage.competitionId);
  await db.competitionStage.delete({ where: { id: stageId } });
  revalidatePath(`/employer/competitions/${stage.competitionId}`);
  return { ok: true };
}

const PrizeSchema = z.object({
  competitionId: z.string(),
  rank: z.coerce.number().int().min(0).max(50),
  title: z.string().min(2).max(80),
  description: z.string().max(400).optional(),
  cashAmountMinor: z.coerce.number().int().min(0).default(0),
  inKind: z.string().max(200).optional(),
  sponsor: z.string().max(120).optional(),
});

export async function addCompetitionPrize(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = PrizeSchema.safeParse({
    competitionId: formData.get("competitionId"),
    rank: formData.get("rank"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    cashAmountMinor: formData.get("cashAmountMinor"),
    inKind: formData.get("inKind") || undefined,
    sponsor: formData.get("sponsor") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid prize." };
  await assertCanEditCompetition(session.user.id, parsed.data.competitionId);
  const comp = await db.competition.findUnique({ where: { id: parsed.data.competitionId } });
  await db.competitionPrize.create({
    data: { ...parsed.data, currency: comp?.prizeCurrency ?? "INR" },
  });
  revalidatePath(`/employer/competitions/${parsed.data.competitionId}`);
  return { ok: true };
}

export async function deleteCompetitionPrize(prizeId: string): Promise<FormState> {
  const session = await requireUser();
  const prize = await db.competitionPrize.findUnique({ where: { id: prizeId } });
  if (!prize) return { ok: false, message: "Not found." };
  await assertCanEditCompetition(session.user.id, prize.competitionId);
  await db.competitionPrize.delete({ where: { id: prizeId } });
  revalidatePath(`/employer/competitions/${prize.competitionId}`);
  return { ok: true };
}

const PerkSchema = z.object({
  competitionId: z.string(),
  jobId: z.string(),
  forRanks: z.array(z.coerce.number().int()).min(1),
  ataStage: z.enum(["APPLIED", "SCREENED", "SHORTLISTED", "INTERVIEW", "ASSESSMENT"]).default("SHORTLISTED"),
  notes: z.string().max(400).optional(),
});

export async function attachJobPerk(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = PerkSchema.safeParse({
    competitionId: formData.get("competitionId"),
    jobId: formData.get("jobId"),
    forRanks: formData.getAll("forRanks").map((v) => Number(v)).filter((n) => !Number.isNaN(n)),
    ataStage: formData.get("ataStage") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid perk." };
  await assertCanEditCompetition(session.user.id, parsed.data.competitionId);
  await db.competitionPerk.upsert({
    where: { competitionId_jobId: { competitionId: parsed.data.competitionId, jobId: parsed.data.jobId } },
    create: parsed.data,
    update: { forRanks: parsed.data.forRanks, ataStage: parsed.data.ataStage, notes: parsed.data.notes },
  });
  revalidatePath(`/employer/competitions/${parsed.data.competitionId}`);
  return { ok: true };
}

export async function submitForReview(id: string): Promise<FormState> {
  const session = await requireUser();
  const comp = await assertCanEditCompetition(session.user.id, id);
  if (comp.status !== "DRAFT" && comp.status !== "CHANGES_REQUESTED") {
    return { ok: false, message: "Already submitted." };
  }
  const stages = await db.competitionStage.count({ where: { competitionId: id } });
  if (stages === 0) return { ok: false, message: "Add at least one stage before submitting." };

  await db.competition.update({
    where: { id },
    data: { status: "PENDING_REVIEW", submittedAt: new Date() },
  });
  await audit({ actorId: session.user.id, action: "competition.submit", entity: "Competition", entityId: id });
  revalidatePath(`/employer/competitions/${id}`);
  revalidatePath("/admin/competitions");
  return { ok: true, message: "Submitted for review." };
}

export async function inviteJudge(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const competitionId = String(formData.get("competitionId") ?? "");
  const email = String(formData.get("email") ?? "").toLowerCase();
  if (!email || !competitionId) return { ok: false, message: "Email + competition required." };
  await assertCanEditCompetition(session.user.id, competitionId);

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { ok: false, message: "User not found. They must sign up first." };
  await db.competitionJudge.upsert({
    where: { competitionId_judgeUserId: { competitionId, judgeUserId: user.id } },
    create: { competitionId, judgeUserId: user.id },
    update: {},
  });
  await notificationsQueue.add("competition.judge-invited", {
    userId: user.id,
    type: "competition.judge-invited",
    title: "You've been invited to judge a competition",
    body: "Open the link to start scoring submissions.",
    link: `/employer/competitions/${competitionId}/judge`,
  });
  revalidatePath(`/employer/competitions/${competitionId}`);
  return { ok: true };
}

// ─── Candidate-side: registration + submissions ─────────────

const RegistrationSchema = z.object({
  competitionId: z.string(),
  teamName: z.string().max(80).optional(),
  inviteEmails: z.array(z.string().email()).max(10).default([]),
});

export async function registerForCompetition(_prev: FormState, formData: FormData): Promise<FormState & { registrationId?: string }> {
  const session = await requireUser();
  await rateLimitOrThrow(`competition-register:${session.user.id}`, "ats");
  const parsed = RegistrationSchema.safeParse({
    competitionId: formData.get("competitionId"),
    teamName: formData.get("teamName") || undefined,
    inviteEmails: formData.getAll("inviteEmails").map(String).filter(Boolean),
  });
  if (!parsed.success) return { ok: false, message: "Invalid registration." };

  const comp = await db.competition.findUnique({ where: { id: parsed.data.competitionId } });
  if (!comp || comp.status !== "LIVE") return { ok: false, message: "Registrations not open." };
  const now = new Date();
  if (comp.registrationOpensAt && now < comp.registrationOpensAt) return { ok: false, message: "Registration not yet open." };
  if (comp.registrationClosesAt && now > comp.registrationClosesAt) return { ok: false, message: "Registration closed." };

  const existing = await db.competitionRegistration.findFirst({
    where: { competitionId: parsed.data.competitionId, leaderUserId: session.user.id },
  });
  if (existing) return { ok: false, message: "You've already registered.", registrationId: existing.id };

  if (comp.isTeamBased) {
    if (parsed.data.inviteEmails.length === 0) return { ok: false, message: "Invite at least one teammate." };
    const teamSize = parsed.data.inviteEmails.length + 1;
    if (teamSize < (comp.minTeamSize ?? 1) || teamSize > (comp.maxTeamSize ?? 99)) {
      return { ok: false, message: `Team size must be between ${comp.minTeamSize} and ${comp.maxTeamSize}.` };
    }
  }

  const registration = await db.competitionRegistration.create({
    data: {
      competitionId: parsed.data.competitionId,
      leaderUserId: session.user.id,
      teamName: parsed.data.teamName,
      members: {
        create: [
          { userId: session.user.id, role: "LEADER", status: "ACCEPTED", acceptedAt: new Date() },
          ...parsed.data.inviteEmails.map((email) => ({
            invitedEmail: email.toLowerCase(),
            role: "MEMBER" as const,
            status: "INVITED" as const,
            inviteToken: crypto.randomBytes(20).toString("hex"),
          })),
        ],
      },
    },
  });
  await db.competition.update({
    where: { id: parsed.data.competitionId },
    data: { registrationsCount: { increment: 1 } },
  });
  await audit({
    actorId: session.user.id,
    action: "competition.register",
    entity: "Competition",
    entityId: parsed.data.competitionId,
    meta: { registrationId: registration.id, teamSize: parsed.data.inviteEmails.length + 1 },
  });

  // Fire team invite emails
  for (const email of parsed.data.inviteEmails) {
    const tokenRow = await db.competitionTeamMember.findFirst({
      where: { registrationId: registration.id, invitedEmail: email.toLowerCase() },
    });
    if (!tokenRow?.inviteToken) continue;
    const link = `${env.NEXT_PUBLIC_APP_URL}/competitions/${comp.slug}/team-invite/${tokenRow.inviteToken}`;
    await sendMail({
      to: email,
      subject: `You're invited to team "${parsed.data.teamName ?? "untitled"}" on eMobility Careers`,
      html: `<p>You've been invited to join the team for <strong>${comp.title}</strong>.</p><p><a href="${link}">Accept the invite →</a></p>`,
    }).catch(() => undefined);
  }

  return { ok: true, registrationId: registration.id };
}

export async function acceptTeamInvite(
  token: string,
): Promise<FormState & { competitionSlug?: string; teamId?: string }> {
  const session = await requireUser();
  const member = await db.competitionTeamMember.findUnique({
    where: { inviteToken: token },
    include: { registration: { include: { competition: true } } },
  });
  if (!member) return { ok: false, message: "Invite not found." };
  if (member.status === "REMOVED") {
    return { ok: false, message: "This invite was withdrawn by the captain." };
  }
  if (member.status === "ACCEPTED") {
    return {
      ok: true,
      message: "Already accepted.",
      competitionSlug: member.registration.competition.slug,
      teamId: member.registrationId,
    };
  }
  // Honour the 14-day expiry — the bulk-invite flow stamps this now.
  if (member.inviteExpiresAt && member.inviteExpiresAt < new Date()) {
    return { ok: false, message: "This invite has expired. Ask the captain to resend." };
  }
  // Email match — the invite was addressed to a specific person.
  // We allow the match if EITHER (a) we already wrote userId at
  // bulk-invite time (because that email matched an existing account)
  // AND it's the same user, OR (b) the calling user's email equals
  // the invitedEmail. This second branch is the "new user signed up
  // and is now claiming the invite" path.
  const sessionEmail = session.user.email?.toLowerCase() ?? "";
  if (member.userId && member.userId !== session.user.id) {
    return { ok: false, message: "This invite was issued to a different account." };
  }
  if (!member.userId && member.invitedEmail !== sessionEmail) {
    return { ok: false, message: "This invite was sent to a different email." };
  }
  await db.competitionTeamMember.update({
    where: { id: member.id },
    data: { userId: session.user.id, status: "ACCEPTED", acceptedAt: new Date() },
  });
  // Notify the captain that someone joined.
  await notificationsQueue
    .add("competition.team-member-joined", {
      userId: member.registration.leaderUserId,
      type: "competition.team_member_joined",
      title: "Someone joined your team",
      body: `${session.user.name ?? sessionEmail} accepted your invite.`,
      link: `/me/teams/${member.registrationId}`,
      channels: ["IN_APP"],
      actorId: session.user.id,
    })
    .catch(() => undefined);
  return {
    ok: true,
    competitionSlug: member.registration.competition.slug,
    teamId: member.registrationId,
  };
}

const SubmissionSchema = z.object({
  registrationId: z.string(),
  stageId: z.string(),
  title: z.string().min(3).max(160),
  summary: z.string().max(4000).optional(),
  body: z.string().max(50_000).optional(),
  attachmentUrls: z.array(z.string().url()).max(10).default([]),
  externalUrl: z.string().url().optional().or(z.literal("")),
  /// Optional first-class field for the working-prototype video.
  /// Validated as a URL only — we don't gate on YouTube/Vimeo here
  /// because hosts may want to allow self-hosted MinIO or Drive
  /// links. The team page renderer detects YouTube/Vimeo for
  /// inline embed and falls back to a "Watch video" link otherwise.
  prototypeVideoUrl: z.string().url().optional().or(z.literal("")),
});

export async function submitCompetitionEntry(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  const parsed = SubmissionSchema.safeParse({
    registrationId: formData.get("registrationId"),
    stageId: formData.get("stageId"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    body: formData.get("body") || undefined,
    attachmentUrls: formData.getAll("attachmentUrls").map(String).filter(Boolean),
    externalUrl: formData.get("externalUrl") || undefined,
    prototypeVideoUrl: formData.get("prototypeVideoUrl") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid submission.", fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()) };
  const reg = await db.competitionRegistration.findFirst({
    where: {
      id: parsed.data.registrationId,
      OR: [{ leaderUserId: session.user.id }, { members: { some: { userId: session.user.id } } }],
    },
  });
  if (!reg) return { ok: false, message: "Registration not found." };
  const stage = await db.competitionStage.findUnique({ where: { id: parsed.data.stageId } });
  if (!stage || stage.competitionId !== reg.competitionId) return { ok: false, message: "Stage mismatch." };

  const isLate = stage.endsAt < new Date();
  await db.competitionSubmission.upsert({
    where: { registrationId_stageId: { registrationId: reg.id, stageId: stage.id } },
    create: {
      registrationId: reg.id,
      stageId: stage.id,
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body,
      attachmentUrls: parsed.data.attachmentUrls,
      externalUrl: parsed.data.externalUrl || null,
      prototypeVideoUrl: parsed.data.prototypeVideoUrl || null,
      isLate,
    },
    update: {
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body,
      attachmentUrls: parsed.data.attachmentUrls,
      externalUrl: parsed.data.externalUrl || null,
      prototypeVideoUrl: parsed.data.prototypeVideoUrl || null,
      submittedAt: new Date(),
    },
  });
  await db.competition.update({
    where: { id: reg.competitionId },
    data: { submissionsCount: { increment: 1 } },
  });
  await db.competitionRegistration.update({
    where: { id: reg.id },
    data: { status: "SUBMITTED", currentStageId: stage.id },
  });
  revalidatePath(`/me/competitions`);
  return { ok: true, message: "Submitted." };
}

// ─── Judging ─────────────────────────────────────────────────

const ScoreSchema = z.object({
  submissionId: z.string(),
  scoresByCriteria: z.record(z.coerce.number().min(0).max(10)),
  feedback: z.string().max(4000).optional(),
});

export async function submitScore(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireUser();
  // Reconstruct the criteria map from form fields prefixed with "score:"
  const scoresByCriteria: Record<string, number> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("score:")) {
      const num = Number(v);
      if (Number.isFinite(num)) scoresByCriteria[k.slice(6)] = num;
    }
  }
  const parsed = ScoreSchema.safeParse({
    submissionId: formData.get("submissionId"),
    scoresByCriteria,
    feedback: formData.get("feedback") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid score." };

  const submission = await db.competitionSubmission.findUnique({
    where: { id: parsed.data.submissionId },
    include: { stage: { include: { competition: true } } },
  });
  if (!submission) return { ok: false, message: "Submission not found." };

  const judge = await db.competitionJudge.findFirst({
    where: { competitionId: submission.stage.competitionId, judgeUserId: session.user.id },
  });
  if (!judge) return { ok: false, message: "Not a judge for this competition." };
  if (judge.stageIds.length && !judge.stageIds.includes(submission.stageId)) {
    return { ok: false, message: "Not assigned to this stage." };
  }

  const total = Object.values(parsed.data.scoresByCriteria).reduce((acc, n) => acc + n, 0);
  await db.competitionScore.upsert({
    where: { submissionId_judgeUserId: { submissionId: submission.id, judgeUserId: session.user.id } },
    create: {
      submissionId: submission.id,
      registrationId: submission.registrationId,
      judgeUserId: session.user.id,
      scoresByCriteria: parsed.data.scoresByCriteria,
      total,
      feedback: parsed.data.feedback,
    },
    update: { scoresByCriteria: parsed.data.scoresByCriteria, total, feedback: parsed.data.feedback },
  });
  revalidatePath(`/employer/competitions/${submission.stage.competitionId}/judge`);
  return { ok: true, message: "Scored." };
}

// ─── Status transitions: lifecycle ────────────────────────────

export async function setRegistrationFinalRank(registrationId: string, rank: number, status: "WINNER" | "RUNNER_UP" | "FINALIST" | "ELIMINATED"): Promise<FormState> {
  const session = await requireUser();
  const reg = await db.competitionRegistration.findUnique({
    where: { id: registrationId },
    include: { competition: true },
  });
  if (!reg) return { ok: false, message: "Not found." };
  await assertCanEditCompetition(session.user.id, reg.competitionId);
  await db.competitionRegistration.update({
    where: { id: registrationId },
    data: { finalRank: rank, status },
  });
  revalidatePath(`/employer/competitions/${reg.competitionId}`);
  return { ok: true };
}

export async function announceResults(competitionId: string): Promise<FormState> {
  try {
  const session = await requireUser();
  await assertCanEditCompetition(session.user.id, competitionId);
  const comp = await db.competition.findUnique({
    where: { id: competitionId },
    include: { perks: true, registrations: { where: { finalRank: { not: null } } } },
  });
  if (!comp) return { ok: false, message: "Not found." };
  if (comp.status === "RESULTS") return { ok: false, message: "Already announced." };
  if (comp.status !== "LIVE" && comp.status !== "JUDGING") {
    return { ok: false, message: "Competition must be LIVE or JUDGING." };
  }
  // Tag the prize rows with awarded registration ids by rank.
  for (const reg of comp.registrations) {
    if (reg.finalRank == null) continue;
    await db.competitionPrize.updateMany({
      where: { competitionId, rank: reg.finalRank },
      data: { awardedRegistrationId: reg.id },
    });
    // Auto-create ATS application for any matching perk
    for (const perk of comp.perks) {
      if (!perk.forRanks.includes(reg.finalRank)) continue;
      const candidate = await db.candidateProfile.findUnique({ where: { userId: reg.leaderUserId } });
      if (!candidate) continue;
      const exists = await db.application.findFirst({
        where: { candidateId: candidate.id, jobId: perk.jobId },
      });
      if (exists) continue;
      await db.application.create({
        data: {
          candidateId: candidate.id,
          jobId: perk.jobId,
          stage: perk.ataStage,
          source: "AI_INVITED",
          coverLetter: `Auto-added via competition perk for "${comp.title}" (rank ${reg.finalRank}).`,
        },
      });
    }
    // Notify the team leader
    await notificationsQueue.add("competition.result", {
      userId: reg.leaderUserId,
      type: "competition.result-announced",
      title: `Results: ${comp.title}`,
      body: `Your team finished at rank ${reg.finalRank}.`,
      link: `/competitions/${comp.slug}`,
    });
  }
  await db.competition.update({
    where: { id: competitionId },
    data: { status: "RESULTS", resultsAt: new Date() },
  });
  await audit({ actorId: session.user.id, action: "competition.announce", entity: "Competition", entityId: competitionId });
  revalidatePath(`/employer/competitions/${competitionId}`);
  revalidatePath(`/competitions/${comp.slug}`);
  return { ok: true, message: "Results announced." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err, competitionId }, "[announce-results] unhandled error");
    return {
      ok: false,
      message:
        "Couldn't announce results — the team has been notified. Try again in a moment.",
    };
  }
}

// ─── Admin moderation ───────────────────────────────────────

async function requireAdmin() {
  const session = await requireUser();
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

export async function approveCompetition(competitionId: string, goLiveAt?: Date): Promise<FormState> {
  const session = await requireAdmin();
  const comp = await db.competition.findUnique({ where: { id: competitionId } });
  if (!comp) return { ok: false, message: "Not found." };
  await db.competition.update({
    where: { id: competitionId },
    data: {
      status: goLiveAt && goLiveAt > new Date() ? "APPROVED" : "LIVE",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      publishedAt: goLiveAt && goLiveAt > new Date() ? goLiveAt : new Date(),
    },
  });
  await notificationsQueue.add("competition.approved", {
    userId: comp.postedById,
    type: "competition.approved",
    title: `"${comp.title}" approved`,
    body: "Your competition is approved and live.",
    link: `/competitions/${comp.slug}`,
  });
  await audit({ actorId: session.user.id, action: "competition.approve", entity: "Competition", entityId: competitionId });
  revalidatePath("/admin/competitions");
  revalidatePath(`/competitions/${comp.slug}`);
  return { ok: true };
}

export async function requestCompetitionChanges(competitionId: string, note: string): Promise<FormState> {
  const session = await requireAdmin();
  const comp = await db.competition.findUnique({ where: { id: competitionId } });
  if (!comp) return { ok: false, message: "Not found." };
  await db.competition.update({
    where: { id: competitionId },
    data: {
      status: "CHANGES_REQUESTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      reviewerNotes: note,
    },
  });
  await notificationsQueue.add("competition.changes", {
    userId: comp.postedById,
    type: "competition.changes-requested",
    title: `Changes requested for "${comp.title}"`,
    body: note,
    link: `/employer/competitions/${competitionId}`,
  });
  revalidatePath("/admin/competitions");
  return { ok: true };
}

export async function rejectCompetition(competitionId: string, note: string): Promise<FormState> {
  const session = await requireAdmin();
  const comp = await db.competition.findUnique({ where: { id: competitionId } });
  if (!comp) return { ok: false, message: "Not found." };
  await db.competition.update({
    where: { id: competitionId },
    data: { status: "REJECTED", reviewedById: session.user.id, reviewedAt: new Date(), reviewerNotes: note },
  });
  await notificationsQueue.add("competition.rejected", {
    userId: comp.postedById,
    type: "competition.rejected",
    title: `"${comp.title}" rejected`,
    body: note,
    link: `/employer/competitions/${competitionId}`,
  });
  revalidatePath("/admin/competitions");
  return { ok: true };
}

const PrizePayoutSchema = z.object({
  prizeId: z.string(),
  externalRef: z.string().min(1).max(100),
  notes: z.string().max(1000).optional(),
});

export async function recordPrizePayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const parsed = PrizePayoutSchema.safeParse({
    prizeId: formData.get("prizeId"),
    externalRef: formData.get("externalRef"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, message: "Invalid input." };
  const prize = await db.competitionPrize.findUnique({ where: { id: parsed.data.prizeId } });
  if (!prize) return { ok: false, message: "Not found." };
  await db.competitionPrize.update({
    where: { id: parsed.data.prizeId },
    data: {
      payoutStatus: "PAID",
      payoutExternalRef: parsed.data.externalRef,
      payoutNotes: parsed.data.notes,
      paidAt: new Date(),
    },
  });
  await audit({
    actorId: session.user.id,
    action: "competition.prize.payout",
    entity: "CompetitionPrize",
    entityId: parsed.data.prizeId,
    meta: { externalRef: parsed.data.externalRef },
  });
  revalidatePath(`/admin/competitions/${prize.competitionId}/prizes`);
  return { ok: true };
}
