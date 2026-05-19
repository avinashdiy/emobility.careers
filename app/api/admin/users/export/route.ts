import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

/**
 * Admin CSV export of users matching the same filters /admin/users uses.
 *
 *   ?role=ADMIN|EMPLOYER|CANDIDATE   (optional)
 *   ?status=ACTIVE|SUSPENDED|DELETED (optional)
 *   ?q=substring                     (optional, against email + name)
 *
 * Capped at 10,000 rows per export so a typo doesn't dump the whole
 * userbase into a single response. Sort is `createdAt DESC` to match
 * the page UI.
 */

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const role = url.searchParams.get("role") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const q = url.searchParams.get("q")?.trim() ?? undefined;

  const where: Prisma.UserWhereInput = {
    ...(role && (role === "ADMIN" || role === "EMPLOYER" || role === "CANDIDATE")
      ? { role }
      : {}),
    ...(status && (status === "ACTIVE" || status === "SUSPENDED" || status === "DELETED")
      ? { status }
      : {}),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const users = await db.user.findMany({
    where,
    take: 10_000,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      // Phone is captured at signup (SMS-OTP path) or added later via
      // /me/settings. Some legacy candidates have phone on
      // CandidateProfile but not on User — we surface both columns
      // separately so the admin can see which copy exists.
      phone: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      phoneVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      candidateProfile: {
        select: {
          slug: true,
          // CandidateProfile carries its own phone copy — older
          // signups stored phone here exclusively. Export both so the
          // admin can deduplicate / pick whichever is non-null.
          phone: true,
          email: true,
          country: true,
          city: true,
          headline: true,
          isDIYguruVerified: true,
          idVerificationStatus: true,
          totalExperienceMonths: true,
          openToWork: true,
          // Application count lives on CandidateProfile, not User —
          // applications hang off the profile, not the user. Same for
          // saved jobs, alerts. Posts hang off User directly so we
          // count those separately below.
          _count: { select: { applications: true } },
        },
      },
      employerProfile: {
        select: { company: { select: { name: true, slug: true } } },
      },
      _count: { select: { posts: true } },
    },
  });

  const headers = [
    "id",
    "email",
    "name",
    "phone",
    "role",
    "status",
    "email_verified_at",
    "phone_verified_at",
    "last_login_at",
    "created_at",
    "candidate_slug",
    "candidate_phone",
    "candidate_email",
    "country",
    "city",
    "headline",
    "diyguru_verified",
    "id_verification_status",
    "experience_months",
    "open_to_work",
    "company_name",
    "company_slug",
    "applications_count",
    "posts_count",
  ];
  const rows = [headers.map(csvCell).join(",")];
  for (const u of users) {
    const c = u.candidateProfile;
    const e = u.employerProfile?.company;
    rows.push(
      [
        u.id,
        u.email,
        u.name,
        u.phone,
        u.role,
        u.status,
        u.emailVerifiedAt,
        u.phoneVerifiedAt,
        u.lastLoginAt,
        u.createdAt,
        c?.slug,
        c?.phone,
        c?.email,
        c?.country,
        c?.city,
        c?.headline,
        c?.isDIYguruVerified,
        c?.idVerificationStatus,
        c?.totalExperienceMonths,
        c?.openToWork,
        e?.name,
        e?.slug,
        c?._count.applications ?? 0,
        u._count.posts,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const body = rows.join("\n") + "\n";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="emobility-users-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
