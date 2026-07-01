"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { syncAllRecruitathonScores } from "@/lib/recruitathon/sheets-sync";

/**
 * Admin: re-push every submitted Recruitathon score to the team's Google
 * Sheet. Idempotent (the Apps Script upserts by email+role), so this is
 * the safe backfill for anything the live per-submission push missed.
 */
export async function resyncRecruitathonScores() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const res = await syncAllRecruitathonScores();
  const q = res.ok
    ? `synced=${res.pushed}&total=${res.total}`
    : `syncerror=${encodeURIComponent(res.error ?? "failed")}`;
  redirect(`/admin/recruitathon/banks?${q}`);
}
