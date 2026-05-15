"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { NotificationChannel } from "@prisma/client";
import { logger } from "@/lib/logger";

const alertSchema = z.object({
  query: z.string().min(1).max(200),
  domain: z.string().optional(),
  workMode: z.string().optional(),
  profileMode: z.string().optional(),
  location: z.string().optional(),
  frequency: z.enum(["instant", "daily", "weekly"]).default("daily"),
  email: z.coerce.boolean().optional(),
  sms: z.coerce.boolean().optional(),
});

async function requireCandidate() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");
  return { session, profile };
}

export async function createJobAlert(formData: FormData) {
  const { profile } = await requireCandidate();
  await rateLimitOrThrow(`alert:${profile.userId}`, "saveItem");
  const parsed = alertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[alerts] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  const { query, frequency, email, sms, ...filters } = parsed.data;
  const channels: NotificationChannel[] = [NotificationChannel.IN_APP];
  if (email) channels.push(NotificationChannel.EMAIL);
  if (sms) channels.push(NotificationChannel.SMS);

  await db.jobAlert.create({
    data: {
      candidateId: profile.id,
      query,
      filters: filters as object,
      frequency,
      channels,
      isActive: true,
    },
  });
  revalidatePath("/me/alerts");
  redirect("/me/alerts?notice=" + encodeURIComponent("Alert saved"));
}

export async function deleteJobAlert(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = z.string().parse(formData.get("id"));
  await db.jobAlert.deleteMany({ where: { id, candidateId: profile.id } });
  revalidatePath("/me/alerts");
}

export async function toggleJobAlert(formData: FormData) {
  const { profile } = await requireCandidate();
  const id = z.string().parse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  await db.jobAlert.updateMany({
    where: { id, candidateId: profile.id },
    data: { isActive },
  });
  revalidatePath("/me/alerts");
}
