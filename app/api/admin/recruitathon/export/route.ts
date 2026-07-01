import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Admin export of ALL Recruitathon data as a CSV (opens directly in
 * Excel). One row per candidate × JD engagement (a JD they selected
 * and/or took the test for), so a candidate with 3 roles yields 3 rows.
 * Each row carries: candidate fields, the JD/role/company + AI fitment
 * score + priority rank, and the test marks + proctoring signals.
 *
 * Anchored on the UNION of selections and attempts so a completed test
 * whose selection was later changed is never dropped.
 */

const MAX = 20_000;

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CANDIDATE_SELECT = {
  id: true,
  slug: true,
  firstName: true,
  lastName: true,
  phone: true,
  city: true,
  country: true,
  location: true,
  headline: true,
  totalExperienceMonths: true,
  user: { select: { email: true } },
  education: {
    select: { degree: true, field: true, institution: true, endYear: true },
    orderBy: { endYear: "desc" },
    take: 1,
  },
  skills: { select: { skill: { select: { name: true } } }, take: 40 },
} satisfies Prisma.CandidateProfileSelect;

const JD_SELECT = { id: true, company: true, role: true, level: true, slug: true } satisfies Prisma.RecruitathonJdSelect;

interface Cand {
  id: string; slug: string; name: string; email: string; phone: string;
  city: string; headline: string; expYears: string; education: string; skills: string;
}
interface Jd { id: string; company: string; role: string; level: string; slug: string }

function normCand(c: Prisma.CandidateProfileGetPayload<{ select: typeof CANDIDATE_SELECT }>): Cand {
  const ed = c.education[0];
  return {
    id: c.id,
    slug: c.slug ?? "",
    name: [c.firstName, c.lastName].filter(Boolean).join(" "),
    email: c.user?.email ?? "",
    phone: c.phone ?? "",
    city: [c.city, c.country].filter(Boolean).join(", ") || (c.location ?? ""),
    headline: c.headline ?? "",
    expYears: c.totalExperienceMonths ? (c.totalExperienceMonths / 12).toFixed(1) : "0",
    education: ed ? [ed.degree, ed.field, ed.institution].filter(Boolean).join(", ") : "",
    skills: c.skills.map((s) => s.skill?.name).filter(Boolean).join("; "),
  };
}
function normJd(j: Prisma.RecruitathonJdGetPayload<{ select: typeof JD_SELECT }>): Jd {
  return { id: j.id, company: j.company, role: j.role, level: j.level, slug: j.slug };
}

export async function GET(req: NextRequest) {
  void req;
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

  const [selections, attempts] = await Promise.all([
    db.recruitathonJdSelection.findMany({
      take: MAX,
      include: { candidate: { select: CANDIDATE_SELECT }, jd: { select: JD_SELECT } },
    }),
    db.assessmentAttempt.findMany({
      where: { assessment: { recruitathonJd: { isNot: null } } },
      take: MAX,
      select: {
        candidateId: true,
        score: true,
        passed: true,
        submittedAt: true,
        proctorMeta: true,
        candidate: { select: CANDIDATE_SELECT },
        assessment: { select: { recruitathonJd: { select: JD_SELECT } } },
      },
    }),
  ]);

  const key = (candidateId: string, jdId: string) => `${candidateId}::${jdId}`;
  const candById = new Map<string, Cand>();
  const jdById = new Map<string, Jd>();
  const selByKey = new Map<string, (typeof selections)[number]>();
  const attByKey = new Map<string, (typeof attempts)[number]>();
  const selsByCand = new Map<string, { jdId: string; matchScore: number | null }[]>();

  for (const s of selections) {
    candById.set(s.candidate.id, normCand(s.candidate));
    jdById.set(s.jd.id, normJd(s.jd));
    selByKey.set(key(s.candidateId, s.jdId), s);
    const arr = selsByCand.get(s.candidateId) ?? [];
    arr.push({ jdId: s.jdId, matchScore: s.matchScore });
    selsByCand.set(s.candidateId, arr);
  }
  for (const a of attempts) {
    const jd = a.assessment?.recruitathonJd;
    if (!jd || !a.candidate) continue;
    candById.set(a.candidate.id, normCand(a.candidate));
    jdById.set(jd.id, normJd(jd));
    attByKey.set(key(a.candidateId, jd.id), a);
  }

  // Priority rank per candidate: highest AI match among their selected JDs = 1.
  const priorityByKey = new Map<string, number>();
  for (const [cid, arr] of selsByCand) {
    arr.sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1));
    arr.forEach((s, i) => priorityByKey.set(key(cid, s.jdId), i + 1));
  }

  const headers = [
    "candidate_id", "profile_slug", "name", "email", "phone", "city", "headline",
    "experience_years", "highest_education", "skills",
    "company", "role", "level", "jd_slug",
    "match_score_fitment", "priority", "selected", "attempted",
    "score", "result", "tab_switch_flags", "camera_flags", "terminated", "submitted_at",
  ];

  const out: string[][] = [];
  const keys = new Set<string>([...selByKey.keys(), ...attByKey.keys()]);
  for (const k of keys) {
    const [candidateId, jdId] = k.split("::");
    const c = candById.get(candidateId);
    const jd = jdById.get(jdId);
    if (!c || !jd) continue;
    const sel = selByKey.get(k);
    const att = attByKey.get(k);
    const pm = (att?.proctorMeta ?? null) as { flags?: number; cameraFlags?: number; terminated?: boolean } | null;
    const result = att ? (att.submittedAt ? (att.passed ? "PASS" : "FAIL") : "IN PROGRESS") : "";
    out.push([
      c.id, c.slug, c.name, c.email, c.phone, c.city, c.headline,
      c.expYears, c.education, c.skills,
      jd.company, jd.role, jd.level, jd.slug,
      sel?.matchScore != null ? String(sel.matchScore) : "",
      priorityByKey.get(k) != null ? String(priorityByKey.get(k)) : "",
      sel ? "Yes" : "No",
      att ? "Yes" : "No",
      att?.score != null ? String(att.score) : "",
      result,
      pm?.flags != null ? String(pm.flags) : (att ? "0" : ""),
      pm?.cameraFlags != null ? String(pm.cameraFlags) : (att ? "0" : ""),
      att ? (pm?.terminated ? "Yes" : "No") : "",
      att?.submittedAt ? att.submittedAt.toISOString() : "",
    ]);
  }

  // Sort so each employer sees a role's candidates ranked by score, then fitment.
  out.sort((a, b) =>
    a[10].localeCompare(b[10]) || // company
    a[11].localeCompare(b[11]) || // role
    (Number(b[18] || -1) - Number(a[18] || -1)) || // score desc
    (Number(b[14] || -1) - Number(a[14] || -1))    // match desc
  );

  const lines = [headers.join(",")];
  for (const row of out) lines.push(row.map(csvCell).join(","));
  // UTF-8 BOM so Excel renders names / ₹ / accents correctly.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="recruitathon-export-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
