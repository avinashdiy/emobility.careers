"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Prisma, type PlanInterval, type PlanScope } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const upsertSchema = z.object({
  id: z.string().optional(),
  key: z.string().regex(/^[a-z0-9-]+$/i).min(2).max(80),
  name: z.string().min(2).max(120),
  scope: z.enum(["CANDIDATE", "EMPLOYER"]),
  interval: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]),
  amountMinor: z.coerce.number().int().min(0),
  currency: z.string().length(3).default("INR"),
  description: z.string().max(2000).optional(),
  features: z.string().optional(), // JSON
  isActive: z.coerce.boolean().optional(),
});

export async function upsertPlan(formData: FormData) {
  const session = await requireAdmin();
  const parsed = upsertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/billing?error=" + encodeURIComponent("Invalid plan data"));
  }
  const { id, features, ...rest } = parsed.data;
  let parsedFeatures: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (features && features.trim()) {
    try {
      parsedFeatures = JSON.parse(features) as Prisma.InputJsonValue;
    } catch {
      redirect("/admin/billing?error=" + encodeURIComponent("Features must be valid JSON"));
    }
  }
  const data = {
    ...rest,
    scope: rest.scope as PlanScope,
    interval: rest.interval as PlanInterval,
    features: parsedFeatures,
    isActive: rest.isActive ?? true,
  };
  if (id) {
    await db.plan.update({ where: { id }, data });
    await audit({
      actorId: session.user.id,
      action: "billing.plan_updated",
      entity: "Plan",
      entityId: id,
    });
  } else {
    const created = await db.plan.create({ data });
    await audit({
      actorId: session.user.id,
      action: "billing.plan_created",
      entity: "Plan",
      entityId: created.id,
      meta: { key: created.key, scope: created.scope },
    });
  }
  revalidatePath("/admin/billing");
}

export async function deactivatePlan(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  await db.plan.update({ where: { id }, data: { isActive: false } });
  await audit({
    actorId: session.user.id,
    action: "billing.plan_deactivated",
    entity: "Plan",
    entityId: id,
  });
  revalidatePath("/admin/billing");
}
