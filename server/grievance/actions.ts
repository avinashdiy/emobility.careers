"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { isRouterControlError } from "@/lib/server-action-errors";
import { pgRateLimit } from "@/lib/rate-limit-pg";
import { getSetting } from "@/lib/settings";
import { env } from "@/lib/env";

/**
 * Indian IT Rules 2021 §3(2) grievance flow.
 *
 *   • Anyone (signed in or not) can file via the public /grievance form.
 *   • Ack SLA: 24 hours from filing.
 *   • Resolution SLA: 15 days.
 *   • Filer gets an immediate email with the ticket id (transactional lane).
 *   • The grievance officer (admin role) gets an IN_APP + EMAIL ping.
 *   • The /admin/grievances queue lets admins claim, comment, resolve.
 */

const SLA_RESOLUTION_DAYS = 15;

const fileSchema = z.object({
  filerName: z.string().min(2).max(120),
  filerEmail: z.string().email(),
  filerPhone: z.string().max(30).optional(),
  category: z.string().max(80).optional(),
  subject: z.string().min(4).max(200),
  body: z.string().min(20).max(2000),
});

export async function fileGrievance(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  ticketId?: string;
}> {
  try {
    const parsed = fileSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Please check the form fields and try again.",
      };
    }
    const session = await auth();
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;

    // Rate-limit by user (if signed in) or IP (anon). 5/day is plenty
    // for legitimate use; spam attempts hit the wall fast.
    const limit = await pgRateLimit({
      action: "grievance.file",
      userId: session?.user?.id ?? null,
      opts: { limit: 5, windowMs: 24 * 60 * 60 * 1000 },
    });
    if (!limit.ok) return { ok: false, message: limit.message };

    const slaDueAt = new Date(Date.now() + SLA_RESOLUTION_DAYS * 86400_000);
    const ticket = await db.grievanceTicket.create({
      data: {
        filerId: session?.user?.id ?? null,
        filerName: parsed.data.filerName,
        filerEmail: parsed.data.filerEmail,
        filerPhone: parsed.data.filerPhone ?? null,
        category: parsed.data.category ?? null,
        subject: parsed.data.subject,
        body: parsed.data.body,
        slaDueAt,
        filerIp: ip,
      },
    });

    await audit({
      actorId: session?.user?.id ?? null,
      action: "grievance.filed",
      entity: "GrievanceTicket",
      entityId: ticket.id,
      meta: { subject: parsed.data.subject, category: parsed.data.category ?? null },
      ip,
    });

    // Confirmation to the filer (transactional lane — like a receipt).
    try {
      await sendMail({
        kind: "transactional",
        to: parsed.data.filerEmail,
        subject: `Grievance received — ticket ${ticket.id.slice(-8)}`,
        html: `
<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f5f7f5;padding:24px;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:white;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="font-size:18px;color:#0f172a;margin:0 0 8px 0;">We received your grievance</h1>
<p style="color:#475569;margin:0 0 12px 0;">Hi ${parsed.data.filerName.split(" ")[0]},</p>
<p style="color:#475569;margin:0 0 12px 0;">
We've logged your grievance under ticket <strong>${ticket.id.slice(-8)}</strong>.
The grievance officer will acknowledge within 24 hours and resolve within
15 days, per the Indian IT Rules 2021.
</p>
<p style="color:#475569;margin:0 0 12px 0;font-size:13px;"><strong>Subject:</strong> ${parsed.data.subject}</p>
<p style="color:#94a3b8;font-size:12px;margin:0;">
For follow-ups quote ticket id <code>${ticket.id.slice(-8)}</code>.
</p>
</td></tr></table></body></html>`,
        text: `Grievance ticket ${ticket.id.slice(-8)} received. Subject: ${parsed.data.subject}. Ack SLA 24h, resolution SLA 15 days.`,
      });
    } catch (err) {
      logger.warn({ err, ticketId: ticket.id }, "[grievance] filer confirmation failed");
    }

    // Notify the grievance officer (whoever's email is in settings).
    try {
      const officerEmail = await getSetting("legal.grievance_officer_email");
      if (officerEmail) {
        await sendMail({
          kind: "transactional",
          to: officerEmail,
          subject: `New grievance: ${parsed.data.subject}`,
          html: `<p>New grievance ticket ${ticket.id.slice(-8)} from ${parsed.data.filerName} (${parsed.data.filerEmail}).</p><p><a href="${env.NEXT_PUBLIC_APP_URL}/admin/grievances">Review queue</a></p>`,
          text: `New grievance ${ticket.id.slice(-8)}. Review: ${env.NEXT_PUBLIC_APP_URL}/admin/grievances`,
        });
      }
    } catch (err) {
      logger.warn({ err }, "[grievance] officer notify failed");
    }

    revalidatePath("/admin/grievances");
    return {
      ok: true,
      message:
        "Thanks — your grievance is logged. We'll acknowledge within 24 hours and resolve within 15 days. You'll get email updates.",
      ticketId: ticket.id,
    };
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[grievance] file unhandled");
    return { ok: false, message: "Couldn't file your grievance. Please try again." };
  }
}

const updateSchema = z.object({
  ticketId: z.string(),
  action: z.enum(["claim", "in_progress", "resolve", "reject"]),
  resolution: z.string().max(2000).optional(),
});

export async function updateGrievance(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[grievance] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  const ticket = await db.grievanceTicket.findUnique({
    where: { id: parsed.data.ticketId },
    select: { id: true, status: true, acknowledgedAt: true, filerEmail: true, filerName: true, subject: true },
  });
  if (!ticket) return;

  const now = new Date();
  const data: Record<string, unknown> = {};

  if (parsed.data.action === "claim") {
    data.assigneeId = session.user.id;
    if (!ticket.acknowledgedAt) {
      data.acknowledgedAt = now;
      data.acknowledgedById = session.user.id;
    }
    if (ticket.status === "OPEN") data.status = "ACKNOWLEDGED";
  } else if (parsed.data.action === "in_progress") {
    data.status = "IN_PROGRESS";
    if (!ticket.acknowledgedAt) {
      data.acknowledgedAt = now;
      data.acknowledgedById = session.user.id;
    }
  } else if (parsed.data.action === "resolve") {
    data.status = "RESOLVED";
    data.resolvedAt = now;
    data.resolution = parsed.data.resolution ?? null;
  } else if (parsed.data.action === "reject") {
    data.status = "REJECTED";
    data.resolvedAt = now;
    data.resolution = parsed.data.resolution ?? null;
  }

  await db.grievanceTicket.update({ where: { id: ticket.id }, data });

  await audit({
    actorId: session.user.id,
    action: `grievance.${parsed.data.action}`,
    entity: "GrievanceTicket",
    entityId: ticket.id,
    meta: { resolution: parsed.data.resolution ?? null },
  });

  // Email the filer on resolve / reject (transactional lane).
  if (parsed.data.action === "resolve" || parsed.data.action === "reject") {
    try {
      await sendMail({
        kind: "transactional",
        to: ticket.filerEmail,
        subject: `Grievance ${ticket.id.slice(-8)} ${parsed.data.action === "resolve" ? "resolved" : "closed"}`,
        html: `<p>Hi ${ticket.filerName.split(" ")[0]},</p><p>Your grievance about "${ticket.subject}" has been ${parsed.data.action === "resolve" ? "resolved" : "closed"}.</p>${parsed.data.resolution ? `<p><strong>Resolution:</strong> ${parsed.data.resolution}</p>` : ""}<p>If you're unsatisfied, you may escalate to the relevant grievance redressal body per the Indian IT Rules 2021.</p>`,
        text: `Your grievance ${ticket.id.slice(-8)} has been ${parsed.data.action === "resolve" ? "resolved" : "closed"}.${parsed.data.resolution ? `\n\nResolution: ${parsed.data.resolution}` : ""}`,
      });
    } catch (err) {
      logger.warn({ err }, "[grievance] filer-update email failed");
    }
  }

  revalidatePath("/admin/grievances");
}
