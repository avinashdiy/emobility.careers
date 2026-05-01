import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ApplicationStage } from "@prisma/client";

/**
 * Admin analytics CSV export. Mirrors the metric set on
 * /admin/analytics so what the admin sees is exactly what they
 * download. Read-only — admin role gated, no mutation.
 *
 * Range parsing is identical to the page (`?range=7d|30d|90d|1y`
 * or `?from=YYYY-MM-DD&to=YYYY-MM-DD`). When neither is supplied
 * we default to 30 days, matching the page's first paint.
 */

const STAGES_FUNNEL: ApplicationStage[] = [
  "APPLIED", "SCREENED", "SHORTLISTED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED",
];

const PRESET_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

function parseRange(url: URL): { from: Date; to: Date; label: string } {
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  if (fromStr && toStr) {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
      return { from, to, label: `${fromStr}_to_${toStr}` };
    }
  }
  const range = url.searchParams.get("range") ?? "30d";
  const days = PRESET_DAYS[range] ?? 30;
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
  return { from, to, label: `last_${days}d` };
}

// Trivially safe CSV escape: wrap in quotes when the value contains
// comma / quote / newline; double-up internal quotes. Good enough for
// our integer-and-string metrics.
function csvCell(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }
  const { from, to, label } = parseRange(new URL(req.url));

  const [
    signups, candidates, employers,
    jobs, applications, hires,
    diyguruVerified, diyguruNonVerified,
    funnel,
  ] = await Promise.all([
    db.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { role: "CANDIDATE", createdAt: { gte: from, lte: to } } }),
    db.user.count({ where: { role: "EMPLOYER", createdAt: { gte: from, lte: to } } }),
    db.jobPosting.count({ where: { publishedAt: { gte: from, lte: to } } }),
    db.application.count({ where: { appliedAt: { gte: from, lte: to } } }),
    db.application.count({ where: { stage: "HIRED", updatedAt: { gte: from, lte: to } } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: true } }),
    db.candidateProfile.count({ where: { isDIYguruVerified: false } }),
    Promise.all(
      STAGES_FUNNEL.map((stage) =>
        db.application.count({ where: { stage } }).then((count) => ({ stage, count })),
      ),
    ),
  ]);

  const lines: string[] = [];
  lines.push("metric,value");
  lines.push(`window_from,${csvCell(from.toISOString())}`);
  lines.push(`window_to,${csvCell(to.toISOString())}`);
  lines.push(`signups,${signups}`);
  lines.push(`candidate_signups,${candidates}`);
  lines.push(`employer_signups,${employers}`);
  lines.push(`jobs_published,${jobs}`);
  lines.push(`applications,${applications}`);
  lines.push(`hires,${hires}`);
  lines.push(`diyguru_verified,${diyguruVerified}`);
  lines.push(`diyguru_unverified,${diyguruNonVerified}`);
  lines.push(""); // visual separator (Excel/Sheets ignore)
  lines.push("funnel_stage,count");
  for (const f of funnel) {
    lines.push(`${csvCell(f.stage)},${f.count}`);
  }

  const body = lines.join("\n") + "\n";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="emobility-analytics-${label}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
