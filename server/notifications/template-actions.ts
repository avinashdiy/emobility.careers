"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, NotificationTemplateChannel } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { isRouterControlError } from "@/lib/server-action-errors";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Admin CRUD for `NotificationTemplate`. These rows override the
 * inline title/body/channels of `dispatchNotification(...)` calls
 * at runtime. See lib/notifications/dispatch.ts for the lookup +
 * interpolation rules.
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
    // Keep keys human-typeable + URL-safe — matches the convention
    // used by hard-coded `type` strings already in the codebase
    // ("application.stage_changed", "fair.slot_booked").
    .regex(/^[a-z0-9_.]+$/, "Use lowercase letters, digits, dots, underscores"),
  label: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  titleOverride: z.string().trim().max(200).optional(),
  bodyOverride: z.string().trim().max(2000).optional(),
  /// FormData encoding for the channels checkbox group.
  channels: z.array(z.nativeEnum(NotificationTemplateChannel)).default([]),
  variables: z.string().trim().max(500).optional(),
  active: z.coerce.boolean().optional(),
});

export async function upsertNotificationTemplate(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();

    // FormData multi-value for checkboxes: parse `channels` separately.
    const channels = formData.getAll("channels").map((c) => String(c)) as NotificationTemplateChannel[];
    const variables = String(formData.get("variables") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const raw = {
      ...Object.fromEntries(formData),
      channels,
    };
    const parsed = UpsertSchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid template";
      redirect("/admin/notifications/templates?error=" + encodeURIComponent(msg));
    }
    const { id, key, label, description, titleOverride, bodyOverride, active } = parsed.data;

    const data = {
      key,
      label: label || null,
      description: description || null,
      titleOverride: titleOverride || null,
      bodyOverride: bodyOverride || null,
      channels: parsed.data.channels,
      variables,
      active: active ?? true,
      authorId: session.user.id,
    };

    try {
      if (id) {
        await db.notificationTemplate.update({ where: { id }, data });
      } else {
        await db.notificationTemplate.create({ data });
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        redirect(
          "/admin/notifications/templates?error=" +
            encodeURIComponent(`A template with key "${key}" already exists.`),
        );
      }
      throw err;
    }

    try {
      await audit({
        actorId: session.user.id,
        action: id ? "notification_template.update" : "notification_template.create",
        entity: "NotificationTemplate",
        entityId: id ?? null,
        meta: { key },
      });
    } catch {/* best-effort */}

    revalidatePath("/admin/notifications/templates");
    redirect(
      "/admin/notifications/templates?notice=" +
        encodeURIComponent(id ? "Template updated." : "Template created."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[upsertNotificationTemplate] failed");
    redirect("/admin/notifications/templates?error=" + encodeURIComponent("Save failed."));
  }
}

const DeleteSchema = z.object({ id: z.string().min(1) });

export async function deleteNotificationTemplate(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = DeleteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/notifications/templates?error=" + encodeURIComponent("Invalid request"));
    }
    await db.notificationTemplate.delete({ where: { id: parsed.data.id } });
    try {
      await audit({
        actorId: session.user.id,
        action: "notification_template.delete",
        entity: "NotificationTemplate",
        entityId: parsed.data.id,
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/notifications/templates");
    redirect(
      "/admin/notifications/templates?notice=" +
        encodeURIComponent("Template deleted — inline copy restored."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[deleteNotificationTemplate] failed");
    redirect("/admin/notifications/templates?error=" + encodeURIComponent("Delete failed."));
  }
}

const ToggleSchema = z.object({ id: z.string().min(1) });

export async function toggleNotificationTemplateActive(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = ToggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/notifications/templates?error=" + encodeURIComponent("Invalid request"));
    }
    const tmpl = await db.notificationTemplate.findUnique({
      where: { id: parsed.data.id },
      select: { active: true },
    });
    if (!tmpl) {
      redirect("/admin/notifications/templates?error=" + encodeURIComponent("Not found"));
    }
    await db.notificationTemplate.update({
      where: { id: parsed.data.id },
      data: { active: !tmpl.active },
    });
    try {
      await audit({
        actorId: session.user.id,
        action: "notification_template.toggle",
        entity: "NotificationTemplate",
        entityId: parsed.data.id,
        meta: { active: !tmpl.active },
      });
    } catch {/* best-effort */}
    revalidatePath("/admin/notifications/templates");
    redirect("/admin/notifications/templates?notice=Toggled");
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[toggleNotificationTemplateActive] failed");
    redirect("/admin/notifications/templates?error=" + encodeURIComponent("Toggle failed."));
  }
}

const PreviewSchema = z.object({
  id: z.string().min(1),
  sampleTitle: z.string().trim().max(200).optional(),
  sampleBody: z.string().trim().max(1000).optional(),
});

/**
 * Fires a one-off dispatch of this template to the admin themselves
 * (IN_APP only) so they can see what subscribers will receive. The
 * dispatcher's template-lookup path runs unchanged — if the template
 * is active, its copy wins; if not, the sample inline values win.
 * Notification appears in the admin's `/me/notifications`.
 */
export async function previewNotificationTemplate(formData: FormData): Promise<void> {
  try {
    const session = await requireAdmin();
    const parsed = PreviewSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      redirect("/admin/notifications/templates?error=" + encodeURIComponent("Invalid preview"));
    }
    const tmpl = await db.notificationTemplate.findUnique({
      where: { id: parsed.data.id },
      select: { key: true },
    });
    if (!tmpl) {
      redirect("/admin/notifications/templates?error=" + encodeURIComponent("Not found"));
    }
    await dispatchNotification({
      userId: session.user.id,
      type: tmpl.key,
      title: parsed.data.sampleTitle || `[Preview] ${tmpl.key}`,
      body: parsed.data.sampleBody || "Sample body — replace at the call site.",
      link: "/admin/notifications/templates",
      channels: ["IN_APP"],
    });
    redirect(
      "/admin/notifications/templates?notice=" +
        encodeURIComponent("Preview sent to your inbox. Check /me/notifications."),
    );
  } catch (err) {
    if (isRouterControlError(err)) throw err;
    logger.error({ err }, "[previewNotificationTemplate] failed");
    redirect("/admin/notifications/templates?error=" + encodeURIComponent("Preview failed."));
  }
}
