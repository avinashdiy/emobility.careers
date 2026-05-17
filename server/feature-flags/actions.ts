"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, FeatureFlagType } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { invalidateFlagCache, invalidateAllFlagCache } from "@/lib/feature-flags";

/**
 * Admin CRUD for `FeatureFlag` + `FeatureFlagTarget`. See
 * `lib/feature-flags.ts` for the resolver logic these rows feed.
 */

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const UpsertSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, digits, underscores only"),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  type: z.nativeEnum(FeatureFlagType),
  enabled: z.coerce.boolean().optional(),
  rolloutPercent: z.coerce.number().int().min(0).max(100).default(0),
  defaultForAnonymous: z.coerce.boolean().optional(),
});

export async function upsertFeatureFlag(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = UpsertSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid flag";
      redirect("/admin/feature-flags?error=" + encodeURIComponent(msg));
    }
    const { id, key, label, description, type, enabled, rolloutPercent, defaultForAnonymous } = parsed.data;

    const data = {
      key,
      label,
      description: description || null,
      type,
      enabled: enabled ?? false,
      rolloutPercent: type === "PERCENTAGE" ? rolloutPercent : 0,
      defaultForAnonymous: defaultForAnonymous ?? false,
      authorId: session.user.id,
    };

    let flagId = id;
    try {
      if (id) {
        await db.featureFlag.update({ where: { id }, data });
      } else {
        const created = await db.featureFlag.create({ data, select: { id: true } });
        flagId = created.id;
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        redirect(
          "/admin/feature-flags?error=" +
            encodeURIComponent(`A flag with key "${key}" already exists.`),
        );
      }
      throw err;
    }

    invalidateFlagCache(key);

    try {
      await audit({
        actorId: session.user.id,
        action: id ? "feature_flag.update" : "feature_flag.create",
        entity: "FeatureFlag",
        entityId: flagId ?? null,
        meta: { key, type, enabled: data.enabled, rolloutPercent: data.rolloutPercent },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/feature-flags");
    redirect(
      `/admin/feature-flags/${flagId}?notice=` +
        encodeURIComponent(id ? "Flag updated." : "Flag created."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[upsertFeatureFlag] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Save failed."));
  }
}

const RolloutSchema = z.object({
  id: z.string().min(1),
  rolloutPercent: z.coerce.number().int().min(0).max(100),
});

/**
 * Quick rollout percent slider — separate action so the dashboard
 * can ramp without having to repost the full edit form.
 */
export async function setFeatureFlagRollout(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = RolloutSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Invalid rollout"));
    }
    const flag = await db.featureFlag.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, key: true, type: true },
    });
    if (!flag) redirect("/admin/feature-flags?error=" + encodeURIComponent("Not found"));
    if (flag.type !== "PERCENTAGE") {
      redirect(
        "/admin/feature-flags?error=" +
          encodeURIComponent("Rollout only applies to PERCENTAGE flags."),
      );
    }

    await db.featureFlag.update({
      where: { id: flag.id },
      data: { rolloutPercent: parsed.data.rolloutPercent },
    });
    invalidateFlagCache(flag.key);

    try {
      await audit({
        actorId: session.user.id,
        action: "feature_flag.rollout_change",
        entity: "FeatureFlag",
        entityId: flag.id,
        meta: { key: flag.key, percent: parsed.data.rolloutPercent },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/feature-flags");
    redirect(`/admin/feature-flags/${flag.id}?notice=Rollout updated.`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[setFeatureFlagRollout] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Update failed."));
  }
}

const ToggleSchema = z.object({ id: z.string().min(1) });

export async function toggleFeatureFlagEnabled(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = ToggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Invalid request"));
    }
    const flag = await db.featureFlag.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, key: true, enabled: true },
    });
    if (!flag) redirect("/admin/feature-flags?error=" + encodeURIComponent("Not found"));

    await db.featureFlag.update({
      where: { id: flag.id },
      data: {
        enabled: !flag.enabled,
        ...(flag.enabled === false && !flag ? { startedAt: new Date() } : {}),
      },
    });
    invalidateFlagCache(flag.key);

    try {
      await audit({
        actorId: session.user.id,
        action: "feature_flag.toggle",
        entity: "FeatureFlag",
        entityId: flag.id,
        meta: { key: flag.key, enabled: !flag.enabled },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/feature-flags");
    redirect("/admin/feature-flags?notice=Toggled.");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[toggleFeatureFlagEnabled] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Toggle failed."));
  }
}

const DeleteSchema = z.object({ id: z.string().min(1) });

export async function deleteFeatureFlag(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Invalid request"));
    }
    const flag = await db.featureFlag.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, key: true },
    });
    if (!flag) redirect("/admin/feature-flags?error=" + encodeURIComponent("Not found"));

    await db.featureFlag.delete({ where: { id: flag.id } });
    invalidateFlagCache(flag.key);

    try {
      await audit({
        actorId: session.user.id,
        action: "feature_flag.delete",
        entity: "FeatureFlag",
        entityId: flag.id,
        meta: { key: flag.key },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/feature-flags");
    redirect("/admin/feature-flags?notice=Flag deleted.");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[deleteFeatureFlag] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Delete failed."));
  }
}

// ─── Targets ──────────────────────────────────────────────────────

const AddTargetSchema = z.object({
  flagId: z.string().min(1),
  /// Accept either a user id OR an email — admin shouldn't have to
  /// look up the id manually.
  userIdOrEmail: z.string().trim().min(1).max(160),
  enabled: z.coerce.boolean().optional(),
  note: z.string().trim().max(300).optional(),
});

export async function addFeatureFlagTarget(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = AddTargetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Invalid target"));
    }
    const { flagId, userIdOrEmail, enabled, note } = parsed.data;

    const flag = await db.featureFlag.findUnique({
      where: { id: flagId },
      select: { id: true, key: true },
    });
    if (!flag) redirect("/admin/feature-flags?error=" + encodeURIComponent("Not found"));

    // Resolve the user — accept id or email.
    const user = userIdOrEmail.includes("@")
      ? await db.user.findUnique({
          where: { email: userIdOrEmail.toLowerCase() },
          select: { id: true },
        })
      : await db.user.findUnique({
          where: { id: userIdOrEmail },
          select: { id: true },
        });
    if (!user) {
      redirect(
        `/admin/feature-flags/${flag.id}?error=` +
          encodeURIComponent(`No user matches "${userIdOrEmail}".`),
      );
    }

    try {
      await db.featureFlagTarget.create({
        data: {
          flagId: flag.id,
          userId: user.id,
          enabled: enabled ?? true,
          note: note || null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        redirect(
          `/admin/feature-flags/${flag.id}?error=` +
            encodeURIComponent("User is already targeted for this flag."),
        );
      }
      throw err;
    }
    invalidateFlagCache(flag.key);

    try {
      await audit({
        actorId: session.user.id,
        action: "feature_flag.target_add",
        entity: "FeatureFlag",
        entityId: flag.id,
        meta: { key: flag.key, targetUserId: user.id },
      });
    } catch {/* best-effort */}

    revalidatePath(`/admin/feature-flags/${flag.id}`);
    redirect(`/admin/feature-flags/${flag.id}?notice=Target added.`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[addFeatureFlagTarget] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Add target failed."));
  }
}

const RemoveTargetSchema = z.object({ id: z.string().min(1) });

export async function removeFeatureFlagTarget(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = RemoveTargetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Invalid request"));
    }
    const target = await db.featureFlagTarget.findUnique({
      where: { id: parsed.data.id },
      select: { flagId: true, flag: { select: { id: true, key: true } } },
    });
    if (!target) {
      redirect("/admin/feature-flags?error=" + encodeURIComponent("Target not found"));
    }
    await db.featureFlagTarget.delete({ where: { id: parsed.data.id } });
    invalidateFlagCache(target.flag.key);

    try {
      await audit({
        actorId: session.user.id,
        action: "feature_flag.target_remove",
        entity: "FeatureFlag",
        entityId: target.flag.id,
        meta: { key: target.flag.key },
      });
    } catch {/* best-effort */}

    revalidatePath(`/admin/feature-flags/${target.flag.id}`);
    redirect(`/admin/feature-flags/${target.flag.id}?notice=Target removed.`);
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[removeFeatureFlagTarget] failed");
    redirect("/admin/feature-flags?error=" + encodeURIComponent("Remove failed."));
  }
}

/**
 * Admin-callable nuke of the in-process cache. Useful after manual
 * DB edits / SQL console fixes. Doesn't fan out across processes —
 * other Node workers still wait up to 60s.
 */
export async function clearFeatureFlagCache(): Promise<void> {
  await requireAdmin();
  invalidateAllFlagCache();
  redirect("/admin/feature-flags?notice=Cache cleared.");
}
