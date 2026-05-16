"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import {
  snapshotFormData,
  zodErrorsToFieldErrors,
  type FormState,
} from "@/lib/form-state";
import { processDueEnrollments } from "@/server/outreach/engine";

/**
 * #21 Sequenced outreach — recruiter-facing CRUD.
 *
 * Three actions:
 *   - createCadence — builds a cadence + its OutreachStep rows from a
 *     single form submit. Each step's body/delay/channels arrive as
 *     repeated form fields.
 *   - enrollCandidates — bulk-enrol the candidates the recruiter has
 *     selected into a chosen cadence. Idempotent per
 *     (cadenceId, candidateId).
 *   - runCadenceTickNow — admin "fire any due steps right now"
 *     trigger; reuses the engine's processDueEnrollments. Also
 *     used by the daily cron worker.
 */

async function requireCompanyAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");
  return { session: session!, employer };
}

const stepShape = z.object({
  delayDays: z.coerce.number().int().min(0).max(60),
  subject: z.string().trim().max(220).optional(),
  body: z.string().trim().min(20).max(2000),
  channels: z.string().optional(), // comma-csv "IN_APP,EMAIL"
});

const createCadenceSchema = z.object({
  label: z.string().trim().min(2).max(120),
  jobId: z.string().min(1).optional().nullable(),
  /** Steps arrive as a JSON-encoded array on a hidden field so we
   *  can render the dynamic "add another step" UI without dealing
   *  with N repeated form rows. Validated to 1-7 steps. */
  stepsJson: z.string().min(2),
});

const VALID_CHANNELS = new Set(["IN_APP", "EMAIL", "SMS", "WHATSAPP", "PUSH"]);

export async function createCadence(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { session, employer } = await requireCompanyAdmin();
    const parsed = createCadenceSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message: "Please fix the highlighted fields.",
        fieldErrors: zodErrorsToFieldErrors(parsed.error.flatten()),
        prevValues: snapshotFormData(formData),
      };
    }

    // Parse the steps JSON. Each step gets the schema treatment so a
    // typo in the editor doesn't write a malformed cadence to the DB.
    let stepsRaw: unknown;
    try {
      stepsRaw = JSON.parse(parsed.data.stepsJson);
    } catch {
      return {
        ok: false,
        message: "Couldn't read the steps payload. Refresh and try again.",
        prevValues: snapshotFormData(formData),
      };
    }
    const stepsParsed = z
      .array(stepShape)
      .min(1)
      .max(7)
      .safeParse(stepsRaw);
    if (!stepsParsed.success) {
      return {
        ok: false,
        message: "Each step needs a delay (days) and a body (20+ chars).",
        prevValues: snapshotFormData(formData),
      };
    }

    // Verify the jobId belongs to this employer's company.
    if (parsed.data.jobId) {
      const job = await db.jobPosting.findFirst({
        where: { id: parsed.data.jobId, companyId: employer.companyId },
        select: { id: true },
      });
      if (!job) {
        return {
          ok: false,
          message: "That job isn't in your company.",
          prevValues: snapshotFormData(formData),
        };
      }
    }

    const cadence = await db.outreachCadence.create({
      data: {
        companyId: employer.companyId,
        jobId: parsed.data.jobId ?? null,
        createdById: session.user.id,
        label: parsed.data.label,
        steps: {
          create: stepsParsed.data.map((s, idx) => {
            // Normalise channels — accept "IN_APP,EMAIL" or the array
            // form. Drop anything that isn't a recognised channel so
            // a typo doesn't silently break delivery.
            const requested = (s.channels ?? "IN_APP,EMAIL")
              .split(",")
              .map((c) => c.trim().toUpperCase())
              .filter((c) => VALID_CHANNELS.has(c));
            return {
              order: idx,
              delayDays: s.delayDays,
              subject: s.subject ?? null,
              body: s.body,
              channels: requested.length > 0 ? requested : ["IN_APP", "EMAIL"],
            };
          }),
        },
      },
    });

    try {
      await audit({
        actorId: session.user.id,
        action: "outreach.cadence_created",
        entity: "OutreachCadence",
        entityId: cadence.id,
        meta: { jobId: parsed.data.jobId, stepCount: stepsParsed.data.length },
      });
    } catch {/* best-effort */}

    revalidatePath("/employer/cadences");
    if (parsed.data.jobId) {
      revalidatePath(`/employer/jobs/${parsed.data.jobId}/cadence`);
    }
    return { ok: true, message: "Cadence created." };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[outreach.create] unexpected");
    return { ok: false, message: "Couldn't create — try again." };
  }
}

const enrollSchema = z.object({
  cadenceId: z.string().min(1),
  candidateIds: z.array(z.string().min(1)).min(1).max(50),
  applicationIds: z.array(z.string().min(1)).optional(),
});

export interface EnrollResult {
  ok: boolean;
  enrolled: number;
  skipped: number;
  message?: string;
}

export async function enrollCandidatesInCadence(input: {
  cadenceId: string;
  candidateIds: string[];
  applicationIds?: string[];
}): Promise<EnrollResult> {
  try {
    const { session, employer } = await requireCompanyAdmin();
    const parsed = enrollSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, enrolled: 0, skipped: 0, message: "Invalid input." };
    }

    const cadence = await db.outreachCadence.findUnique({
      where: { id: parsed.data.cadenceId },
      select: { id: true, companyId: true, enabled: true, jobId: true },
    });
    if (!cadence) return { ok: false, enrolled: 0, skipped: 0, message: "Cadence not found." };
    if (cadence.companyId !== employer.companyId && session.user.role !== "ADMIN") {
      return { ok: false, enrolled: 0, skipped: 0, message: "Cadence isn't yours." };
    }
    if (!cadence.enabled) {
      return { ok: false, enrolled: 0, skipped: 0, message: "Cadence is paused — enable it first." };
    }

    let enrolled = 0;
    let skipped = 0;

    // Map applicationIds (if any) by candidateId so we can attach the
    // enrollment to the right application context. We accept either
    // application-scoped or peer enrollments.
    const appByCandidate = new Map<string, string>();
    if (parsed.data.applicationIds?.length) {
      const apps = await db.application.findMany({
        where: {
          id: { in: parsed.data.applicationIds },
        },
        select: { id: true, candidateId: true, job: { select: { companyId: true } } },
      });
      for (const a of apps) {
        if (a.job.companyId !== employer.companyId) continue;
        appByCandidate.set(a.candidateId, a.id);
      }
    }

    // ─── Cold-spam gate ─────────────────────────────────────────
    // Without this, any company admin could enrol arbitrary
    // candidates from the whole DB and start blasting them
    // WhatsApp/email through the cadence engine. We require each
    // candidate to have AT LEAST ONE pre-existing relationship with
    // this recruiter or the company:
    //   • application at any of the company's jobs, OR
    //   • SavedCandidate row owned by the enrolling recruiter
    // Candidates outside these sets are silently skipped (not
    // rejected with an error) so a partly-valid batch still
    // processes.
    const candidateIdSet = new Set(parsed.data.candidateIds);
    const [appCandidateIds, savedCandidateIds] = await Promise.all([
      db.application
        .findMany({
          where: {
            candidateId: { in: parsed.data.candidateIds },
            job: { companyId: employer.companyId },
          },
          select: { candidateId: true },
          distinct: ["candidateId"],
        })
        .then((rows) => new Set(rows.map((r) => r.candidateId))),
      db.savedCandidate
        .findMany({
          where: {
            candidateId: { in: parsed.data.candidateIds },
            employerUserId: session.user.id,
          },
          select: { candidateId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.candidateId))),
    ]);
    const allowedCandidateIds = new Set<string>();
    for (const id of candidateIdSet) {
      if (appCandidateIds.has(id) || savedCandidateIds.has(id)) {
        allowedCandidateIds.add(id);
      }
    }

    for (const candidateId of parsed.data.candidateIds) {
      if (!allowedCandidateIds.has(candidateId)) {
        // No application or save → cold lead. Skip with no special
        // error; the count surfaces in the result so the recruiter
        // sees they need to save or apply first.
        skipped += 1;
        continue;
      }
      try {
        const existing = await db.outreachEnrollment.findUnique({
          where: { cadenceId_candidateId: { cadenceId: cadence.id, candidateId } },
        });
        if (existing) {
          skipped += 1;
          continue;
        }
        await db.outreachEnrollment.create({
          data: {
            cadenceId: cadence.id,
            candidateId,
            applicationId: appByCandidate.get(candidateId) ?? null,
            enrolledById: session.user.id,
            status: "ACTIVE",
          },
        });
        enrolled += 1;
      } catch (err) {
        logger.warn({ err, candidateId, cadenceId: cadence.id }, "[outreach.enroll] one candidate failed");
        skipped += 1;
      }
    }

    try {
      await audit({
        actorId: session.user.id,
        action: "outreach.enrolled",
        entity: "OutreachCadence",
        entityId: cadence.id,
        meta: { enrolled, skipped, batchSize: parsed.data.candidateIds.length },
      });
    } catch {/* best-effort */}

    revalidatePath("/employer/cadences");
    if (cadence.jobId) revalidatePath(`/employer/jobs/${cadence.jobId}/cadence`);
    return { ok: true, enrolled, skipped };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[outreach.enroll] unexpected");
    return { ok: false, enrolled: 0, skipped: 0, message: "Couldn't enrol — try again." };
  }
}

const toggleSchema = z.object({
  cadenceId: z.string().min(1),
  enabled: z.enum(["true", "false"]),
});

export async function toggleCadence(formData: FormData): Promise<void> {
  const { session, employer } = await requireCompanyAdmin();
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/employer/cadences?error=" + encodeURIComponent("Bad request."));
  const cadence = await db.outreachCadence.findUnique({ where: { id: parsed.data.cadenceId } });
  if (!cadence || cadence.companyId !== employer.companyId) redirect("/403");
  await db.outreachCadence.update({
    where: { id: cadence.id },
    data: { enabled: parsed.data.enabled === "true" },
  });
  try {
    await audit({
      actorId: session.user.id,
      action: parsed.data.enabled === "true" ? "outreach.cadence_enabled" : "outreach.cadence_disabled",
      entity: "OutreachCadence",
      entityId: cadence.id,
    });
  } catch {/* best-effort */}
  revalidatePath("/employer/cadences");
}

/** Admin-only "run the engine right now" trigger. The daily worker
 *  tick is the production path; this surfaces a button for testing +
 *  manual catch-up after worker outages. */
export async function runCadenceTickNow(): Promise<{ ok: boolean; touched: number }> {
  try {
    const session = await auth();
    if (!session?.user || session.user.role !== "ADMIN") {
      return { ok: false, touched: 0 };
    }
    const results = await processDueEnrollments();
    try {
      await audit({
        actorId: session.user.id,
        action: "outreach.tick_manual",
        entity: "OutreachEnrollment",
        entityId: "all",
        meta: { touched: results.length },
      });
    } catch {/* best-effort */}
    return { ok: true, touched: results.length };
  } catch (err) {
    logger.error({ err }, "[outreach.tick] manual failed");
    return { ok: false, touched: 0 };
  }
}
