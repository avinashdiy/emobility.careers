"use server";

import { z } from "zod";
import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail";
import { recruitathonEmailQueue } from "@/lib/queues";

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/gi;
const MAX_RECIPIENTS = 50_000;

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  return session;
}

const createSchema = z.object({
  subject: z.string().trim().min(2).max(200),
  bodyHtml: z.string().trim().min(1).max(100_000),
});

/** Create a DRAFT campaign, then go to its detail page to import + send. */
export async function createEmailCampaign(formData: FormData) {
  const session = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/recruitathon/emails?error=" + encodeURIComponent("Subject and body are required."));
  }
  const c = await db.recruitathonEmailCampaign.create({
    data: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml, createdById: session.user.id, status: "DRAFT" },
    select: { id: true },
  });
  redirect(`/admin/recruitathon/emails/${c.id}`);
}

/** Edit a DRAFT campaign's subject / body (compose in place). */
export async function updateCampaignMessage(formData: FormData) {
  await requireAdmin();
  const campaignId = z.string().parse(formData.get("campaignId"));
  const back = `/admin/recruitathon/emails/${campaignId}`;
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${back}?error=` + encodeURIComponent("Subject and body are required."));
  const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (!campaign) redirect("/admin/recruitathon/emails");
  if (campaign.status !== "DRAFT") redirect(`${back}?error=` + encodeURIComponent("This campaign has already been sent."));
  await db.recruitathonEmailCampaign.update({ where: { id: campaignId }, data: { subject: parsed.data.subject, bodyHtml: parsed.data.bodyHtml } });
  revalidatePath(back);
  redirect(`${back}?notice=` + encodeURIComponent("Message saved."));
}

/** Parse an uploaded CSV, extract + dedupe every email in it, and add
 *  them as PENDING recipients (skipping any already on this campaign). */
export async function importRecipients(formData: FormData) {
  await requireAdmin();
  const campaignId = z.string().parse(formData.get("campaignId"));
  const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id: campaignId }, select: { id: true, status: true } });
  if (!campaign) redirect("/admin/recruitathon/emails");
  const back = `/admin/recruitathon/emails/${campaignId}`;
  if (campaign.status !== "DRAFT") redirect(`${back}?error=` + encodeURIComponent("This campaign has already been sent."));

  const file = formData.get("csv") as File | null;
  if (!file || file.size === 0) redirect(`${back}?error=` + encodeURIComponent("Choose a CSV file to import."));
  if (file.size > 15 * 1024 * 1024) redirect(`${back}?error=` + encodeURIComponent("CSV too large (max 15MB)."));

  let text: string;
  try {
    text = await file.text();
  } catch {
    redirect(`${back}?error=` + encodeURIComponent("Couldn't read that file — re-export as CSV and try again."));
  }

  // Extract emails from EVERY cell (tolerates headers, extra columns,
  // "Name,Email" or a bare list). Dedupe case-insensitively.
  const parsedCsv = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const emails = new Set<string>();
  for (const row of parsedCsv.data) {
    if (!Array.isArray(row)) continue;
    for (const cell of row) {
      const matches = String(cell ?? "").match(EMAIL_RE);
      if (matches) for (const e of matches) emails.add(e.trim().toLowerCase());
    }
    if (emails.size >= MAX_RECIPIENTS) break;
  }

  if (emails.size === 0) redirect(`${back}?error=` + encodeURIComponent("No email addresses found in that CSV."));

  await db.recruitathonEmailRecipient.createMany({
    data: Array.from(emails).map((email) => ({ campaignId, email })),
    skipDuplicates: true,
  });
  const total = await db.recruitathonEmailRecipient.count({ where: { campaignId } });
  await db.recruitathonEmailCampaign.update({ where: { id: campaignId }, data: { recipientCount: total } });

  revalidatePath(back);
  redirect(`${back}?notice=` + encodeURIComponent(`Imported ${emails.size} email(s). ${total} recipient(s) on this campaign.`));
}

/** Send a single test copy to a chosen address (defaults to the admin). */
export async function sendTestEmail(formData: FormData) {
  const session = await requireAdmin();
  const campaignId = z.string().parse(formData.get("campaignId"));
  const to = (z.string().email().safeParse(formData.get("testEmail")).success
    ? String(formData.get("testEmail"))
    : session.user.email) as string | undefined;
  const back = `/admin/recruitathon/emails/${campaignId}`;
  if (!to) redirect(`${back}?error=` + encodeURIComponent("Enter a valid test email address."));

  const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id: campaignId }, select: { subject: true, bodyHtml: true } });
  if (!campaign) redirect("/admin/recruitathon/emails");
  try {
    await sendMail({ to: to!, subject: `[TEST] ${campaign.subject}`, html: campaign.bodyHtml, kind: "transactional" });
  } catch (err) {
    logger.error({ err, campaignId }, "[recruitathon-email] test send failed");
    redirect(`${back}?error=` + encodeURIComponent("Test send failed — check the SES configuration."));
  }
  redirect(`${back}?notice=` + encodeURIComponent(`Test email sent to ${to}.`));
}

/** Kick off the actual bulk send (queued). Guarded + confirm in the UI. */
export async function sendCampaign(formData: FormData) {
  await requireAdmin();
  const campaignId = z.string().parse(formData.get("campaignId"));
  const back = `/admin/recruitathon/emails/${campaignId}`;
  const campaign = await db.recruitathonEmailCampaign.findUnique({
    where: { id: campaignId },
    select: { status: true, recipientCount: true },
  });
  if (!campaign) redirect("/admin/recruitathon/emails");
  if (campaign.status === "SENDING") redirect(`${back}?notice=` + encodeURIComponent("Already sending."));
  if (campaign.status === "SENT") redirect(`${back}?error=` + encodeURIComponent("This campaign has already been sent."));
  if (campaign.recipientCount === 0) redirect(`${back}?error=` + encodeURIComponent("Import recipients before sending."));

  await db.recruitathonEmailCampaign.update({
    where: { id: campaignId },
    data: { status: "SENDING", startedAt: new Date(), completedAt: null },
  });
  // BullMQ custom job ids cannot contain ":".
  await recruitathonEmailQueue.add("send", { campaignId }, { jobId: `campaign-${campaignId}` });
  revalidatePath(back);
  redirect(`${back}?notice=` + encodeURIComponent("Sending started — refresh to watch progress."));
}

/** Delete a campaign (only while DRAFT or FAILED). */
export async function deleteCampaign(formData: FormData) {
  await requireAdmin();
  const campaignId = z.string().parse(formData.get("campaignId"));
  const campaign = await db.recruitathonEmailCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (campaign && (campaign.status === "DRAFT" || campaign.status === "FAILED")) {
    await db.recruitathonEmailCampaign.delete({ where: { id: campaignId } });
  }
  redirect("/admin/recruitathon/emails");
}
