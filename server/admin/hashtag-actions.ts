"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { HashtagState } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  return session;
}

function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/[^a-z0-9_-]/g, "");
}

export async function createHashtagPolicy(formData: FormData) {
  const session = await requireAdmin();
  const tag = normaliseTag(z.string().parse(formData.get("tag")));
  const state = z
    .enum(["FEATURED", "BLOCKED", "MERGED_INTO"])
    .parse(formData.get("state"));
  const displayName = String(formData.get("displayName") ?? "").slice(0, 80) || null;
  const reason = String(formData.get("reason") ?? "").slice(0, 500) || null;
  const mergedInto =
    state === "MERGED_INTO"
      ? normaliseTag(String(formData.get("mergedInto") ?? "")) || null
      : null;
  if (!tag) {
    redirect("/admin/hashtags?error=" + encodeURIComponent("Empty tag."));
  }
  if (state === "MERGED_INTO" && !mergedInto) {
    redirect(
      "/admin/hashtags?error=" +
        encodeURIComponent("Merge target required when state is MERGED_INTO."),
    );
  }
  await db.hashtagPolicy.upsert({
    where: { tag },
    create: {
      tag,
      state: state as HashtagState,
      displayName,
      reason,
      mergedInto,
      createdById: session.user.id,
    },
    update: {
      state: state as HashtagState,
      displayName,
      reason,
      mergedInto,
    },
  });
  await audit({
    actorId: session.user.id,
    action: `hashtag.${state.toLowerCase()}`,
    entity: "HashtagPolicy",
    entityId: tag,
    meta: { displayName, mergedInto, reason },
  });
  revalidatePath("/admin/hashtags");
  revalidatePath(`/tag/${tag}`);
}

export async function deleteHashtagPolicy(formData: FormData) {
  const session = await requireAdmin();
  const tag = z.string().parse(formData.get("tag"));
  await db.hashtagPolicy.delete({ where: { tag } });
  await audit({
    actorId: session.user.id,
    action: "hashtag.policy_removed",
    entity: "HashtagPolicy",
    entityId: tag,
  });
  revalidatePath("/admin/hashtags");
  revalidatePath(`/tag/${tag}`);
}
