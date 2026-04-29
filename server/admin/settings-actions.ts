"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { setSettings, SETTING_DEFINITIONS } from "@/lib/settings";
import type { FormState } from "@/lib/form-state";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

const ALLOWED_KEYS = new Set(SETTING_DEFINITIONS.map((d) => d.key));

/**
 * Saves the values for a single category (the admin form posts only one
 * category at a time so we don't have to ship the entire blob on every save).
 * The category is sent as a hidden field; we only persist keys that belong to
 * that category — defends against malicious payloads injecting `feature.*`
 * values into a "save identity" submission.
 */
export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  const category = z.string().min(1).parse(formData.get("__category"));
  const keysInCategory = SETTING_DEFINITIONS
    .filter((d) => d.category === category)
    .map((d) => d.key);

  const updates: Record<string, string> = {};
  for (const key of keysInCategory) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const def = SETTING_DEFINITIONS.find((d) => d.key === key)!;
    let raw = formData.get(key);
    if (def.type === "BOOLEAN") {
      updates[key] = raw === "on" || raw === "true" ? "true" : "false";
      continue;
    }
    if (raw == null) continue;
    const value = String(raw).trim();
    if (def.type === "NUMBER") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      updates[key] = String(n);
      continue;
    }
    if (def.type === "EMAIL" && value !== "") {
      const ok = z.string().email().safeParse(value);
      if (!ok.success) {
        return { ok: false, message: `${def.label}: invalid email.`, fieldErrors: { [key]: "Invalid email address." } };
      }
    }
    if (def.type === "URL" && value !== "" && !value.startsWith("/")) {
      const ok = z.string().url().safeParse(value);
      if (!ok.success) {
        return { ok: false, message: `${def.label}: invalid URL.`, fieldErrors: { [key]: "Must be a full URL or path starting with /." } };
      }
    }
    if (def.type === "JSON" && value !== "") {
      try {
        JSON.parse(value);
      } catch {
        return { ok: false, message: `${def.label}: invalid JSON.`, fieldErrors: { [key]: "Not valid JSON." } };
      }
    }
    updates[key] = value;
  }

  await setSettings(updates, session.user.id);
  await audit({
    actorId: session.user.id,
    action: "site_settings.update",
    entity: "SiteSetting",
    meta: { category, keys: Object.keys(updates) },
  });
  revalidatePath("/admin/settings");
  return { ok: true, message: `Saved ${Object.keys(updates).length} setting${Object.keys(updates).length === 1 ? "" : "s"}.` };
}
