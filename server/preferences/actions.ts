"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

const prefsSchema = z.object({
  applicationUpdatesEmail: z.coerce.boolean().optional(),
  applicationUpdatesSMS: z.coerce.boolean().optional(),
  messagesEmail: z.coerce.boolean().optional(),
  messagesSMS: z.coerce.boolean().optional(),
  interviewsEmail: z.coerce.boolean().optional(),
  interviewsSMS: z.coerce.boolean().optional(),
  jobAlertsEmail: z.coerce.boolean().optional(),
  jobAlertsSMS: z.coerce.boolean().optional(),
  marketingEmail: z.coerce.boolean().optional(),
});

export async function saveNotificationPrefs(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");

  // Checkboxes that aren't sent default to false
  const raw: Record<string, string> = {};
  const keys = [
    "applicationUpdatesEmail", "applicationUpdatesSMS",
    "messagesEmail", "messagesSMS",
    "interviewsEmail", "interviewsSMS",
    "jobAlertsEmail", "jobAlertsSMS",
    "marketingEmail",
  ];
  for (const k of keys) {
    raw[k] = formData.get(k) ? "true" : "false";
  }
  const parsed = prefsSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[preferences] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, ...parsed.data },
    update: parsed.data,
  });
  revalidatePath("/me/preferences");
}
