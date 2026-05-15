"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";

async function requireCompanyAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: { company: true },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");
  return { session, employer };
}

const stageSchema = z.object({
  name: z.string().min(1).max(60),
  order: z.coerce.number().int().min(0).max(50),
  color: z.string().max(20).optional(),
  slaHours: z.coerce.number().int().min(0).max(24 * 90).optional(),
});

export async function createStage(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const parsed = stageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[employer-pipeline] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }

  const stage = await db.customPipelineStage.create({
    data: {
      companyId: employer.companyId,
      name: parsed.data.name,
      order: parsed.data.order,
      color: parsed.data.color || null,
    },
  });
  if (parsed.data.slaHours && parsed.data.slaHours > 0) {
    await db.sLAConfig.create({
      data: {
        companyId: employer.companyId,
        stageId: stage.id,
        slaHours: parsed.data.slaHours,
      },
    });
  }
  revalidatePath("/employer/pipeline");
}

export async function deleteStage(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.customPipelineStage.deleteMany({
    where: { id, companyId: employer.companyId },
  });
  revalidatePath("/employer/pipeline");
}

export async function toggleStageActive(formData: FormData) {
  const { employer } = await requireCompanyAdmin();
  const id = z.string().parse(formData.get("id"));
  const isActive = formData.get("isActive") === "true";
  await db.customPipelineStage.updateMany({
    where: { id, companyId: employer.companyId },
    data: { isActive },
  });
  revalidatePath("/employer/pipeline");
}
