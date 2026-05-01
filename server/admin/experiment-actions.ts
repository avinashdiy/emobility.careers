"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const variantSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/i).min(1).max(40),
  weight: z.coerce.number().int().min(0).max(100),
});

const createSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]+$/i).min(2).max(80),
  name: z.string().min(2).max(120),
  hypothesis: z.string().max(2000).optional(),
  variants: z.string(), // JSON-encoded array of {key, weight}
});

export async function createExperiment(formData: FormData) {
  const session = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/admin/experiments?error=" + encodeURIComponent("Invalid input"));
  }
  let variants: { key: string; weight: number }[];
  try {
    variants = z.array(variantSchema).parse(JSON.parse(parsed.data.variants));
  } catch {
    redirect("/admin/experiments?error=" + encodeURIComponent("Invalid variants JSON"));
  }
  const total = variants.reduce((s, v) => s + v.weight, 0);
  if (total !== 100) {
    redirect("/admin/experiments?error=" + encodeURIComponent("Variant weights must sum to 100"));
  }
  if (new Set(variants.map((v) => v.key)).size !== variants.length) {
    redirect("/admin/experiments?error=" + encodeURIComponent("Variant keys must be unique"));
  }

  const exp = await db.experiment.create({
    data: {
      key: parsed.data.key,
      name: parsed.data.name,
      hypothesis: parsed.data.hypothesis ?? null,
      status: "DRAFT",
      variants: variants as unknown as object,
      createdById: session.user.id,
    },
  });
  await audit({
    actorId: session.user.id,
    action: "experiment.created",
    entity: "Experiment",
    entityId: exp.id,
    meta: { key: exp.key, variants: variants.length },
  });
  revalidatePath("/admin/experiments");
  redirect(`/admin/experiments/${exp.id}`);
}

export async function setExperimentStatus(formData: FormData) {
  const session = await requireAdmin();
  const id = z.string().parse(formData.get("id"));
  const status = z
    .enum(["DRAFT", "RUNNING", "PAUSED", "COMPLETED"])
    .parse(formData.get("status"));
  const winnerKey = (formData.get("winnerKey") as string | null)?.trim() || null;

  const data: Record<string, unknown> = { status };
  if (status === "RUNNING") {
    data.startedAt = new Date();
  }
  if (status === "COMPLETED") {
    data.endedAt = new Date();
    if (winnerKey) data.winnerKey = winnerKey;
  }

  await db.experiment.update({ where: { id }, data });

  await audit({
    actorId: session.user.id,
    action: `experiment.${status.toLowerCase()}`,
    entity: "Experiment",
    entityId: id,
    meta: { winnerKey },
  });
  revalidatePath("/admin/experiments");
  revalidatePath(`/admin/experiments/${id}`);
}
