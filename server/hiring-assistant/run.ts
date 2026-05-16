import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { dispatchNotification } from "@/lib/notifications/dispatch";
import { structuredJsonCall, StructuredAIError } from "@/lib/ai/structured";
import { aiModels } from "@/lib/ai/openai";

/**
 * #22 AI Hiring Assistant — per-job agentic loop.
 *
 * The assistant has three jobs, all bounded:
 *
 *   1. RANK — read every Application on the job that hasn't been
 *      moved past APPLIED, ordered by matchScore desc. Pin the top-N
 *      (config.draftBatchSize) for outreach.
 *
 *   2. DRAFT — for each of those top-N candidates who hasn't already
 *      received an outreach message on this job, draft a personalised
 *      first-touch ~80-120 words. Sends it through the existing
 *      MessageThread flow so it appears alongside human-authored
 *      messages in the recruiter's inbox (and the candidate's).
 *
 *   3. CHASE — if config.followUpAfterDays is set, find applications
 *      that have received an outreach more than N days ago AND
 *      haven't responded (candidate hasn't sent any message back).
 *      Draft a gentle follow-up.
 *
 * Hard caps enforce the cost ceiling: maxOutreachPerTick caps the
 * combined draft + chase volume per run; the prompt's max_tokens
 * caps per-call burn. We log every decision into HiringAssistantRun
 * so the recruiter can audit + the /admin/ai-ops dashboard can
 * attribute spend.
 */

interface RunDecision {
  candidateId: string;
  candidateName: string;
  matchScore: number | null;
  decision: "drafted" | "chased" | "skipped";
  /** Why we skipped — surfaced in the audit detail JSON. */
  reason?: string;
  messagePreview?: string;
}

const SYSTEM_DRAFT = `You are a recruiter's drafting assistant. Given a job + a candidate,
draft a SHORT first-touch message (80-120 words) the recruiter could
send to the candidate. The tone should match the recruiter's
preference (FORMAL / WARM / CASUAL — defaults to WARM).

Output strict JSON:
  { "subject": "...", "body": "..." }

The subject is the message preview line. The body is the message
itself. Open by name. Cite ONE specific reason this candidate caught
the recruiter's eye (a skill, a verified badge, a relevant experience
line). Mention the role + company by name. End with a soft ask — "would
you be open to a 15-minute chat next week?". Do NOT promise interviews,
salaries, or visa support. Do NOT use markdown.`;

const SYSTEM_CHASE = `You are a recruiter's drafting assistant. The recruiter messaged a
candidate N days ago and got no response. Draft a SHORT follow-up
(50-80 words) in the same TONE the original used. Acknowledge that
the candidate may be busy. Reference ONE specific detail from their
profile so it doesn't feel automated. Soft re-ask: "open to a quick
chat this week?".

Output strict JSON:
  { "subject": "Following up: <role>", "body": "..." }`;

export interface RunHiringAssistantOptions {
  /** Skip the actual AI calls — useful for unit tests + dry-run UI. */
  dryRun?: boolean;
}

/** Run the assistant once for a given job's config. Returns the run
 *  row id. Throws only on unrecoverable infra errors; per-candidate
 *  errors are captured in the run detail. */
export async function runHiringAssistantForJob(
  configId: string,
  opts: RunHiringAssistantOptions = {},
): Promise<string> {
  const config = await db.hiringAssistantConfig.findUnique({
    where: { id: configId },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          description: true,
          companyId: true,
          company: { select: { name: true } },
          postedById: true,
          postedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!config) throw new Error(`HiringAssistantConfig ${configId} not found`);
  if (!config.enabled) {
    logger.warn({ configId }, "[hiring-assistant] run skipped — config disabled");
    throw new Error("Assistant disabled");
  }
  // The runner sends messages on behalf of the recruiter who enabled
  // the assistant. If that recruiter's account was deleted (enabledById
  // SetNull-ed), we can't pick an identity to send from — skip the
  // tick so a different recruiter can re-enable + claim ownership.
  if (!config.enabledById) {
    logger.warn(
      { configId, jobId: config.jobId },
      "[hiring-assistant] run skipped — original recruiter deleted, needs re-enable",
    );
    throw new Error("Assistant has no owner — re-enable from a recruiter account");
  }
  // Local binding narrowed to non-null for the remainder of the
  // function. The substitute below references this; do NOT rename
  // back to config.enabledById without also handling the null case.
  const enabledById = config.enabledById;

  const run = await db.hiringAssistantRun.create({
    data: { configId, status: "RUNNING" },
  });

  const decisions: RunDecision[] = [];
  let rankedCount = 0;
  let draftedCount = 0;
  let chasedCount = 0;
  let tokensUsed = 0;
  let topCandidateLine = "";

  try {
    // ─── RANK ────────────────────────────────────────────────
    const applications = await db.application.findMany({
      where: {
        jobId: config.jobId,
        stage: { in: ["APPLIED", "SCREENED"] }, // top of funnel only
      },
      orderBy: [{ matchScore: "desc" }, { appliedAt: "desc" }],
      include: {
        candidate: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            headline: true,
            isDIYguruVerified: true,
            verifiedSkillBadges: {
              include: { meta: { select: { slug: true, assessment: { select: { title: true } } } } },
            },
            skills: { include: { skill: { select: { name: true } } }, take: 8 },
          },
        },
      },
      take: 50, // hard cap on the rank pool — we never look past this
    });
    rankedCount = applications.length;

    // Top candidate line for the recruiter summary
    if (applications[0]) {
      const c = applications[0].candidate;
      const name = `${c.firstName} ${c.lastName ?? ""}`.trim();
      const score = applications[0].matchScore ?? null;
      topCandidateLine = score !== null
        ? `Top candidate: ${name} (${Math.round(score * 100)}% match)`
        : `Top candidate: ${name}`;
    }

    const draftBudget = Math.min(config.draftBatchSize, config.maxOutreachPerTick);
    let outreachUsed = 0;

    // ─── DRAFT ──────────────────────────────────────────────
    for (const app of applications) {
      if (outreachUsed >= draftBudget) break;
      const candidateName = `${app.candidate.firstName} ${app.candidate.lastName ?? ""}`.trim();

      // Skip if we've already messaged this candidate on this job.
      const existing = await db.messageThread.findFirst({
        where: { applicationId: app.id },
        select: { id: true },
      });
      if (existing) {
        decisions.push({
          candidateId: app.candidate.id,
          candidateName,
          matchScore: app.matchScore,
          decision: "skipped",
          reason: "Thread already exists",
        });
        continue;
      }

      // Build the candidate snapshot for the AI.
      const badgeSummary = app.candidate.verifiedSkillBadges
        .map((b) => b.meta.assessment.title)
        .slice(0, 4)
        .join(", ");
      const skillSummary = app.candidate.skills.map((s) => s.skill.name).slice(0, 8).join(", ");
      const userPrompt = `Job: ${config.job.title} at ${config.job.company.name}.
Tone: ${config.tone}.
Recruiter name: ${config.job.postedBy.name ?? "the recruiter"}.

Candidate: ${candidateName}.
Headline: ${app.candidate.headline ?? "(none)"}.
Match score: ${app.matchScore !== null ? Math.round(app.matchScore * 100) + "%" : "unscored"}.
DIYguru verified: ${app.candidate.isDIYguruVerified ? "yes" : "no"}.
Verified skill badges: ${badgeSummary || "(none)"}.
Skills: ${skillSummary || "(none listed)"}.`;

      if (opts.dryRun) {
        decisions.push({
          candidateId: app.candidate.id,
          candidateName,
          matchScore: app.matchScore,
          decision: "drafted",
          messagePreview: "(dry-run)",
        });
        draftedCount += 1;
        outreachUsed += 1;
        continue;
      }

      try {
        const { data, tokens } = await structuredJsonCall<{ subject: string; body: string }>({
          feature: "wavec.hiring-assistant.draft-outreach",
          model: aiModels.rerank ?? "gpt-4o",
          system: SYSTEM_DRAFT,
          user: userPrompt,
          entityType: "HiringAssistantRun",
          entityId: run.id,
          temperature: 0.6,
          maxOutputTokens: 600,
        });
        tokensUsed += tokens;
        if (!data.body || data.body.length < 30) {
          decisions.push({
            candidateId: app.candidate.id,
            candidateName,
            matchScore: app.matchScore,
            decision: "skipped",
            reason: "AI returned an empty/too-short body",
          });
          continue;
        }
        // Create the thread + the message under the recruiter who
        // owns the job. The candidate sees a normal-looking message
        // in their inbox — we deliberately don't watermark "this was
        // AI-drafted" because the recruiter approves the cadence by
        // running the assistant in the first place.
        const thread = await db.messageThread.create({
          data: {
            applicationId: app.id,
            candidateUserId: app.candidate.userId,
            employerUserId: enabledById,
            lastMessageAt: new Date(),
          },
        });
        await db.message.create({
          data: {
            threadId: thread.id,
            senderId: enabledById,
            body: data.body,
          },
        });
        try {
          await dispatchNotification({
            userId: app.candidate.userId,
            actorId: enabledById,
            type: "message.new",
            title: `Message from ${config.job.company.name}`,
            body: data.subject ?? data.body.slice(0, 120),
            link: `/me/messages/${thread.id}`,
            channels: ["IN_APP", "EMAIL"],
            groupKey: `hiring-assistant:${app.id}`,
          });
        } catch {/* best-effort */}

        decisions.push({
          candidateId: app.candidate.id,
          candidateName,
          matchScore: app.matchScore,
          decision: "drafted",
          messagePreview: data.body.slice(0, 160),
        });
        draftedCount += 1;
        outreachUsed += 1;
      } catch (err) {
        const cause = err instanceof StructuredAIError ? err.cause : "API_ERROR";
        decisions.push({
          candidateId: app.candidate.id,
          candidateName,
          matchScore: app.matchScore,
          decision: "skipped",
          reason: `Draft failed: ${cause}`,
        });
      }
    }

    // ─── CHASE ───────────────────────────────────────────────
    if (config.followUpAfterDays !== null && outreachUsed < config.maxOutreachPerTick) {
      const cutoff = new Date(Date.now() - config.followUpAfterDays * 24 * 60 * 60 * 1000);
      const candidatesToChase = await db.messageThread.findMany({
        where: {
          application: { jobId: config.jobId },
          lastMessageAt: { lte: cutoff },
        },
        include: {
          application: {
            include: {
              candidate: {
                select: { id: true, firstName: true, lastName: true, userId: true, headline: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { senderId: true },
          },
        },
        take: 20,
      });

      for (const thread of candidatesToChase) {
        if (outreachUsed >= config.maxOutreachPerTick) break;
        if (!thread.application) continue;

        // Has the candidate responded since our last message?
        const lastMessages = thread.messages;
        const candidateUserId = thread.application.candidate.userId;
        const candidateResponded = lastMessages.some((m) => m.senderId === candidateUserId);
        if (candidateResponded) continue;
        // Don't chase twice — only if the most recent message is from
        // the recruiter side and it's older than `followUpAfterDays`.
        const lastFromRecruiter = lastMessages[0]?.senderId === enabledById;
        if (!lastFromRecruiter) continue;

        const candidateName = `${thread.application.candidate.firstName} ${
          thread.application.candidate.lastName ?? ""
        }`.trim();

        if (opts.dryRun) {
          decisions.push({
            candidateId: thread.application.candidate.id,
            candidateName,
            matchScore: thread.application.matchScore,
            decision: "chased",
            messagePreview: "(dry-run)",
          });
          chasedCount += 1;
          outreachUsed += 1;
          continue;
        }

        try {
          const { data, tokens } = await structuredJsonCall<{ subject: string; body: string }>({
            feature: "wavec.hiring-assistant.chase",
            model: aiModels.rerank ?? "gpt-4o",
            system: SYSTEM_CHASE,
            user: `Role: ${config.job.title} at ${config.job.company.name}. Candidate: ${candidateName}. Headline: ${thread.application.candidate.headline ?? "(none)"}. Tone: ${config.tone}.`,
            entityType: "HiringAssistantRun",
            entityId: run.id,
            temperature: 0.6,
            maxOutputTokens: 400,
          });
          tokensUsed += tokens;
          if (!data.body || data.body.length < 20) continue;
          await db.message.create({
            data: {
              threadId: thread.id,
              senderId: enabledById,
              body: data.body,
            },
          });
          await db.messageThread.update({
            where: { id: thread.id },
            data: { lastMessageAt: new Date() },
          });
          try {
            await dispatchNotification({
              userId: candidateUserId,
              actorId: enabledById,
              type: "message.new",
              title: `Follow-up from ${config.job.company.name}`,
              body: data.subject ?? data.body.slice(0, 120),
              link: `/me/messages/${thread.id}`,
              channels: ["IN_APP"],
              groupKey: `hiring-assistant-chase:${thread.application.id}`,
            });
          } catch {/* best-effort */}
          decisions.push({
            candidateId: thread.application.candidate.id,
            candidateName,
            matchScore: thread.application.matchScore,
            decision: "chased",
            messagePreview: data.body.slice(0, 160),
          });
          chasedCount += 1;
          outreachUsed += 1;
        } catch (err) {
          const cause = err instanceof StructuredAIError ? err.cause : "API_ERROR";
          decisions.push({
            candidateId: thread.application.candidate.id,
            candidateName,
            matchScore: thread.application.matchScore,
            decision: "skipped",
            reason: `Chase failed: ${cause}`,
          });
        }
      }
    }

    const summary = buildRecruiterSummary({
      rankedCount,
      draftedCount,
      chasedCount,
      topCandidateLine,
    });

    await db.hiringAssistantRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        rankedCount,
        draftedCount,
        chasedCount,
        tokensUsed,
        summary,
        detail: { decisions } as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    // Send the recruiter their daily "your assistant did X" notification.
    try {
      await dispatchNotification({
        userId: enabledById,
        type: "hiring-assistant.run_summary",
        title: `Hiring assistant: ${draftedCount} drafted, ${chasedCount} chased`,
        body: summary.slice(0, 220),
        link: `/employer/jobs/${config.jobId}/assistant`,
        channels: ["IN_APP", "EMAIL"],
        groupKey: `hiring-assistant-summary:${config.jobId}`,
      });
    } catch {/* best-effort */}

    return run.id;
  } catch (err) {
    logger.error({ err, configId, runId: run.id }, "[hiring-assistant] run failed");
    await db.hiringAssistantRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        rankedCount,
        draftedCount,
        chasedCount,
        tokensUsed,
        detail: { decisions, error: err instanceof Error ? err.message : String(err) } as unknown as Prisma.InputJsonValue,
        errorMessage: err instanceof Error ? err.message.slice(0, 1000) : String(err),
      },
    });
    throw err;
  }
}

function buildRecruiterSummary(args: {
  rankedCount: number;
  draftedCount: number;
  chasedCount: number;
  topCandidateLine: string;
}): string {
  const parts: string[] = [];
  parts.push(`I ranked ${args.rankedCount} applications`);
  if (args.draftedCount > 0) parts.push(`drafted ${args.draftedCount} first-touch outreach message${args.draftedCount === 1 ? "" : "s"}`);
  if (args.chasedCount > 0) parts.push(`chased ${args.chasedCount} non-responder${args.chasedCount === 1 ? "" : "s"}`);
  let body = parts.join(", ");
  if (args.topCandidateLine) body += `. ${args.topCandidateLine}.`;
  else body += ".";
  return body;
}
