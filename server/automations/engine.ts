import type {
  Prisma,
  ApplicationStage,
  AutomationTrigger,
  AutomationAction,
} from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * #23 Automation Rules — evaluation engine.
 *
 * Called synchronously inside `applyToJob` (after the Application
 * row is created) and inside `moveStage` (after a stage change).
 * Each call queries every enabled PipelineAutomation for the
 * company/job + trigger, evaluates the conditions JSON against the
 * application snapshot, and runs the action for every matching rule.
 *
 * Design choices:
 *
 *   - Synchronous, not queued. Rules are small (<10 conditions each)
 *     and there are usually <20 enabled per company. Running them in
 *     the request keeps the UX honest: a candidate who applies sees
 *     their auto-shortlisted state immediately, not "after the
 *     worker catches up".
 *
 *   - Always logs (PipelineAutomationLog) — even no-op evaluations.
 *     Lets the recruiter see "this rule considered 50 applications
 *     this week and fired on 3" which is the trust-building signal
 *     for the automation UX.
 *
 *   - Errors are absorbed per-rule. One broken rule (e.g. it
 *     references a deleted credential slug) doesn't kill the whole
 *     evaluation pass; we log the error onto the rule's log row and
 *     skip it.
 */

export interface AutomationConditions {
  matchScoreMin?: number;             // 0..1
  mustBeDIYguruVerified?: boolean;
  mustHaveSkills?: string[];          // skill IDs (preferred) or names
  mustHaveVerifiedBadge?: string[];   // SkillAssessmentMeta slugs
  mustHaveCredential?: string[];      // Credential slugs
  locationsAny?: string[];            // candidate city must be one of these
  evDomainsAny?: string[];            // candidate must have any of these domain slugs
  experienceMin?: number;             // months
  fromStage?: ApplicationStage;
  toStage?: ApplicationStage;
}

export type AutoMoveStagePayload = { toStage: ApplicationStage; reason?: string };
export type NotifyTeamPayload = { message: string };
export type SendTemplatePayload = { subject?: string; body: string };
export type RejectWithReasonPayload = { reason: string };

export interface EvaluationContext {
  applicationId: string;
  trigger: AutomationTrigger;
  /// Optional stage-change context (only set for STAGE_CHANGED).
  fromStage?: ApplicationStage;
  toStage?: ApplicationStage;
}

/**
 * Evaluate every matching rule for the given application + trigger.
 * Returns the number of rules that actually fired (not just evaluated).
 */
export async function evaluateAutomations(ctx: EvaluationContext): Promise<number> {
  const application = await db.application.findUnique({
    where: { id: ctx.applicationId },
    include: {
      job: { select: { id: true, companyId: true, title: true } },
      candidate: {
        select: {
          id: true,
          userId: true,
          city: true,
          isDIYguruVerified: true,
          totalExperienceMonths: true,
          skills: { select: { skill: { select: { id: true, name: true } } } },
          verifiedSkillBadges: { select: { meta: { select: { slug: true } } } },
          credentialsHeld: { select: { credential: { select: { slug: true } } } },
          evDomains: { select: { evDomain: { select: { slug: true } } } },
        },
      },
    },
  });
  if (!application) return 0;

  const rules = await db.pipelineAutomation.findMany({
    where: {
      companyId: application.job.companyId,
      trigger: ctx.trigger,
      enabled: true,
      OR: [
        { jobId: null },              // company-wide rules
        { jobId: application.job.id }, // job-scoped rules
      ],
    },
  });

  if (rules.length === 0) return 0;

  let fired = 0;
  // Buffer log rows so we can flush in a single createMany at the
  // end. Pre-batch, each rule fired its own `pipelineAutomationLog.create`
  // INSIDE the request handler — a company with 20 enabled rules and a
  // viral job (500 applies/hour) generated 10k sequential inserts/hour
  // on the hot path, slowing every apply + stage-change in production.
  const logEntries: Prisma.PipelineAutomationLogCreateManyInput[] = [];
  // Track which rules actually fired so we increment their counters
  // separately at the end. Counter updates can't be batched (each
  // increment is per-row), but only matched rules need them — and
  // typical match rates are << 20%, so this stays cheap.
  const firedRuleIds: string[] = [];

  const candidateSkillIds = new Set(application.candidate.skills.map((s) => s.skill.id));
  const candidateSkillNames = new Set(
    application.candidate.skills.map((s) => s.skill.name.toLowerCase()),
  );
  const candidateBadges = new Set(application.candidate.verifiedSkillBadges.map((b) => b.meta.slug));
  const candidateCredentials = new Set(application.candidate.credentialsHeld.map((c) => c.credential.slug));
  const candidateDomains = new Set(application.candidate.evDomains.map((d) => d.evDomain.slug));

  for (const rule of rules) {
    try {
      const cond = rule.conditions as unknown as AutomationConditions;
      const matchScore = application.matchScore ?? null;

      let matches = true;
      if (cond.matchScoreMin !== undefined && cond.matchScoreMin > 0) {
        // matchScore is nullable until the match worker scores the app.
        // Treat null as "doesn't match yet" rather than fire-early; the
        // rule will re-evaluate on the next stage change once we have
        // a score.
        if (matchScore === null || matchScore < cond.matchScoreMin) matches = false;
      }
      if (matches && cond.mustBeDIYguruVerified) {
        if (!application.candidate.isDIYguruVerified) matches = false;
      }
      if (matches && cond.mustHaveSkills?.length) {
        const has = cond.mustHaveSkills.some(
          (s) => candidateSkillIds.has(s) || candidateSkillNames.has(s.toLowerCase()),
        );
        if (!has) matches = false;
      }
      if (matches && cond.mustHaveVerifiedBadge?.length) {
        const has = cond.mustHaveVerifiedBadge.some((s) => candidateBadges.has(s));
        if (!has) matches = false;
      }
      if (matches && cond.mustHaveCredential?.length) {
        const has = cond.mustHaveCredential.some((s) => candidateCredentials.has(s));
        if (!has) matches = false;
      }
      if (matches && cond.locationsAny?.length) {
        const city = (application.candidate.city ?? "").toLowerCase();
        const has = cond.locationsAny.some((l) => city.includes(l.toLowerCase()));
        if (!has) matches = false;
      }
      if (matches && cond.evDomainsAny?.length) {
        const has = cond.evDomainsAny.some((d) => candidateDomains.has(d));
        if (!has) matches = false;
      }
      if (matches && cond.experienceMin !== undefined) {
        if (application.candidate.totalExperienceMonths < cond.experienceMin) matches = false;
      }
      if (matches && ctx.trigger === "STAGE_CHANGED") {
        if (cond.fromStage && ctx.fromStage !== cond.fromStage) matches = false;
        if (cond.toStage && ctx.toStage !== cond.toStage) matches = false;
      }

      const snapshot = {
        ruleId: rule.id,
        ruleLabel: rule.label,
        applicationId: application.id,
        matchScore,
        candidate: {
          isDIYguruVerified: application.candidate.isDIYguruVerified,
          totalExperienceMonths: application.candidate.totalExperienceMonths,
          city: application.candidate.city,
          domains: Array.from(candidateDomains),
          badges: Array.from(candidateBadges),
          credentials: Array.from(candidateCredentials),
        },
        triggerContext: { trigger: ctx.trigger, fromStage: ctx.fromStage, toStage: ctx.toStage },
        evaluatedAt: new Date().toISOString(),
      };

      if (!matches) {
        logEntries.push({
          automationId: rule.id,
          applicationId: application.id,
          fired: false,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        });
        continue;
      }

      // Run the action.
      await runAction(rule.id, rule.action, rule.actionPayload, application);
      fired += 1;
      firedRuleIds.push(rule.id);

      logEntries.push({
        automationId: rule.id,
        applicationId: application.id,
        fired: true,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      });
    } catch (err) {
      // Single-rule isolation — log the row's error onto its own
      // log entry so the recruiter can see what broke without it
      // killing the rest of the evaluation pass.
      logger.error(
        { err, ruleId: rule.id, applicationId: application.id },
        "[automations] rule evaluation failed",
      );
      logEntries.push({
        automationId: rule.id,
        applicationId: application.id,
        fired: false,
        snapshot: {
          error: err instanceof Error ? err.message : String(err),
          ruleId: rule.id,
        } as unknown as Prisma.InputJsonValue,
      });
    }
  }

  // Single round-trip for every log row in this evaluation pass.
  // skipDuplicates is defensive — there's no unique constraint on
  // (automationId, applicationId), but if a retry or upstream
  // double-call ever surfaces, we'd rather no-op than corrupt the
  // audit trail.
  if (logEntries.length > 0) {
    try {
      await db.pipelineAutomationLog.createMany({
        data: logEntries,
        skipDuplicates: true,
      });
    } catch (err) {
      logger.error(
        { err, count: logEntries.length },
        "[automations] log flush failed",
      );
    }
  }

  // Counter updates — only matched rules. Can't batch because each
  // is an atomic increment; serial here is fine since fired-rule
  // count is typically <5.
  for (const ruleId of firedRuleIds) {
    try {
      await db.pipelineAutomation.update({
        where: { id: ruleId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    } catch (err) {
      logger.warn({ err, ruleId }, "[automations] counter update failed");
    }
  }

  return fired;
}

async function runAction(
  ruleId: string,
  action: AutomationAction,
  payloadJson: unknown,
  application: { id: string; jobId: string; candidate: { userId: string }; job: { title: string; companyId: string } },
): Promise<void> {
  const payload = (payloadJson ?? {}) as Record<string, unknown>;

  switch (action) {
    case "AUTO_MOVE_STAGE": {
      const p = payload as AutoMoveStagePayload;
      if (!p.toStage) return;
      await db.application.update({
        where: { id: application.id },
        data: { stage: p.toStage as ApplicationStage },
      });
      await db.stageHistory.create({
        data: {
          applicationId: application.id,
          toStage: p.toStage as ApplicationStage,
          reason: p.reason ?? `Auto-moved by rule ${ruleId}`,
        },
      });
      return;
    }
    case "REJECT_WITH_REASON": {
      const p = payload as RejectWithReasonPayload;
      await db.application.update({
        where: { id: application.id },
        data: { stage: "REJECTED" as ApplicationStage },
      });
      await db.stageHistory.create({
        data: {
          applicationId: application.id,
          toStage: "REJECTED" as ApplicationStage,
          reason: p.reason ?? "Auto-rejected by rule",
        },
      });
      try {
        await dispatchNotification({
          userId: application.candidate.userId,
          type: "application.auto_rejected",
          title: `Update on ${application.job.title}`,
          body:
            p.reason ??
            "Thanks for applying. We aren't moving forward this time — keep an eye out for new roles that match better.",
          link: "/me/applications",
          channels: ["IN_APP", "EMAIL"],
          groupKey: `application.auto_rejected:${application.id}`,
        });
      } catch {/* best-effort */}
      return;
    }
    case "NOTIFY_TEAM": {
      const p = payload as NotifyTeamPayload;
      // Notify every recruiter on the company. Cheap enough — most
      // companies have <10 recruiters; for very large orgs we'd want
      // a single "team inbox" channel instead.
      const employers = await db.employerProfile.findMany({
        where: { companyId: application.job.companyId },
        select: { userId: true },
      });
      for (const e of employers) {
        try {
          await dispatchNotification({
            userId: e.userId,
            type: "automation.team_notified",
            title: `Automation flagged a candidate`,
            body: p.message ?? "Open the application to see why.",
            link: `/employer/applications/${application.id}`,
            channels: ["IN_APP"],
            groupKey: `automation.notify:${ruleId}:${application.id}`,
          });
        } catch {/* best-effort per recipient */}
      }
      return;
    }
    case "SEND_TEMPLATE": {
      const p = payload as SendTemplatePayload;
      if (!p.body) return;
      try {
        await dispatchNotification({
          userId: application.candidate.userId,
          type: "application.template_message",
          title: p.subject ?? `Update on ${application.job.title}`,
          body: p.body,
          link: "/me/applications",
          channels: ["IN_APP", "EMAIL"],
          groupKey: `automation.template:${ruleId}:${application.id}`,
        });
      } catch {/* best-effort */}
      return;
    }
  }
}
