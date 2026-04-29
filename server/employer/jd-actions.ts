"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { draftJD } from "@/lib/ai/jd-assistant";
import { rateLimitOrThrow } from "@/lib/rate-limit";

export interface PolishedJD {
  description: string;
  responsibilities: string;
  requirements: string;
  skills: string[];
  evDomains: string[];
  seniorityLevel: string;
  benefits?: string;
}

export async function polishJD(input: { title: string; notes: string }): Promise<PolishedJD> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  await rateLimitOrThrow(`ai:${session.user.id}`, "ai");

  const parsed = z.object({
    title: z.string().min(2).max(140),
    notes: z.string().min(20).max(8000),
  }).parse(input);

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: { select: { name: true } } },
  });

  return draftJD({
    title: parsed.title,
    notes: parsed.notes,
    companyName: employer?.company.name,
  });
}
