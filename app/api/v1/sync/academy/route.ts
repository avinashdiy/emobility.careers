// ============================================================================
//  careers-side: POST /api/v1/sync/academy
//
//  Receives the academy → careers event stream from academy's
//  workers/outbox-publisher.ts. Validates HMAC, dedupes by
//  Idempotency-Key, dispatches by topic, acks. All writes are
//  idempotent so replays are no-ops on the second pass.
//
//  Adapted to careers' conventions in Phase 1.x integration:
//    - Prisma client imported as `db` (careers convention) rather
//      than the staged `db as prisma` alias.
//
//  Prereqs careers must add BEFORE deploying this route:
//   1. `LearningCredential` model in careers' prisma/schema.prisma
//      (see careers-patch/prisma-additions.md in this folder)
//   2. `SYNC_WEBHOOK_SECRET` in careers' ecosystem.config.js — must be
//      BYTE-IDENTICAL to academy's. Current value the academy side ships
//      with: VZFRqZeP5jXvQqU5/jg6nlW8sdicorPch/DQABsIxpk=
//   3. Make sure the route is reachable from localhost (it is — both
//      apps live on the same Hetzner box at 127.0.0.1).
//
//  Topics academy currently emits (Phase 1.10 audit):
//    - lesson.completed        (live; fired on 90%-watched threshold)
//    - enrollment.completed    (live; fired when progressPct hits 100)
//    - certificate.issued      (M3 — when the certificate flow lands)
//    - quiz.passed / failed    (M3 — when quiz attempt UI lands)
//    - project.graded          (M3 — when assignment grading lands)
//    - profile.updated         (later — when the profile-edit UI lands)
//    - live_class.attended     (M2)
//    - mock_viva.completed     (M4)
//    - hands_on_training.attended (M4)
//
//  Handlers below cover the M1.10 set (lesson + enrollment + certificate
//  + quiz + project + profile). Add new handlers as new topics light up
//  on the academy side; the dispatch is a plain switch.
// ============================================================================

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const SHARED_SECRET = process.env.SYNC_WEBHOOK_SECRET ?? "";

type AcademyEvent = {
  id: string;
  topic: string;
  subjectId: string; // public.User.id — same User table on both apps
  payload: Record<string, unknown>;
  occurredAt: string;
};

export async function POST(req: Request) {
  // 1. HMAC verification. Never trust the body until the signature checks.
  const sigHeader = req.headers.get("x-signature");
  const idempotencyKey = req.headers.get("idempotency-key");
  if (!sigHeader || !idempotencyKey) {
    return NextResponse.json({ error: "missing headers" }, { status: 400 });
  }
  if (!SHARED_SECRET) {
    return NextResponse.json({ error: "sync not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const expectedSig = createHmac("sha256", SHARED_SECRET).update(rawBody).digest("hex");

  // timingSafeEqual is mandatory — a regular === would leak signature
  // length and content via timing side-channel.
  const expectedBuf = Buffer.from(expectedSig, "hex");
  const actualBuf = Buffer.from(sigHeader, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: AcademyEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "malformed json" }, { status: 400 });
  }

  // 2. Dedup. If we already processed this event id, return 200 immediately
  //    so academy marks it DELIVERED and stops retrying.
  const existing = await db.learningCredential.findUnique({
    where: { sourceEventId: event.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, dedup: true });
  }

  // 3. Topic dispatch. Each handler is independent and idempotent.
  try {
    switch (event.topic) {
      case "lesson.completed":
        // Per-lesson granular events — careers usually doesn't surface
        // these on the profile (too noisy), but log for the activity
        // feed. We still upsert a LearningCredential so the (userId,
        // sourceEventId) dedup holds.
        await handleLessonCompleted(event);
        break;
      case "enrollment.completed":
        await handleEnrollmentCompleted(event);
        break;
      case "certificate.issued":
        await handleCertificateIssued(event);
        break;
      case "quiz.passed":
      case "quiz.failed":
        await handleQuizAttempt(event);
        break;
      case "project.graded":
        await handleProjectGraded(event);
        break;
      case "profile.updated":
        await handleProfileUpdated(event);
        break;
      case "live_class.attended":
      case "mock_viva.completed":
      case "hands_on_training.attended":
        // M2-M4 topics — handlers TBD. Return 200 so academy doesn't
        // retry an event we just haven't built a UI for yet; the row
        // still gets logged by the next branch.
        console.warn("[sync] topic acknowledged but not yet handled:", event.topic);
        break;
      default:
        // Unknown topics return 200 — we don't want academy stuck
        // retrying an event careers can't interpret. Log for triage.
        console.warn("[sync] unknown topic", event.topic);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sync] handler failure", event.id, err);
    // 500 → academy will retry. Handlers must be idempotent.
    return NextResponse.json({ error: "handler failure" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
//  Handlers
// ---------------------------------------------------------------------------

async function handleLessonCompleted(event: AcademyEvent) {
  const p = event.payload as {
    lessonId: string;
    courseId: string;
    completedAt: string;
  };
  await db.learningCredential.upsert({
    where: { sourceEventId: event.id },
    create: {
      userId: event.subjectId,
      sourceSystem: "academy",
      sourceId: `${p.courseId}:${p.lessonId}`,
      sourceEventId: event.id,
      kind: "LESSON_COMPLETION",
      title: "Lesson completed",
      completedAt: new Date(p.completedAt),
    },
    update: {},
  });
}

async function handleEnrollmentCompleted(event: AcademyEvent) {
  const p = event.payload as {
    courseId: string;
    courseTitle: string;
    completedAt: string;
    progressPct: number;
    sponsorTenantId?: string;     // present if academy.Tenant.kind = MASTER/RESELLER/CORPORATE
    sponsorTenantKind?: string;   // "MASTER" | "RESELLER" | "CORPORATE"
  };
  await db.learningCredential.upsert({
    where: { sourceEventId: event.id },
    create: {
      userId: event.subjectId,
      sourceSystem: "academy",
      sourceId: p.courseId,
      sourceEventId: event.id,
      kind: "COURSE_COMPLETION",
      title: p.courseTitle,
      completedAt: new Date(p.completedAt),
      // For corporate-sponsored completions careers renders "Sponsored
      // by <Bosch>" on the candidate's profile. Academy collapsed
      // organisations into Tenant.kind=CORPORATE (Phase 1.2 review).
      sponsorTenantId: p.sponsorTenantId ?? null,
    },
    update: {},
  });
}

async function handleCertificateIssued(event: AcademyEvent) {
  const p = event.payload as {
    publicCode: string;
    courseId: string;
    courseTitle: string;
    pdfUrl?: string;
    issuedAt: string;
  };
  await db.learningCredential.upsert({
    where: { sourceEventId: event.id },
    create: {
      userId: event.subjectId,
      sourceSystem: "academy",
      sourceId: p.publicCode,
      sourceEventId: event.id,
      kind: "CERTIFICATE",
      title: p.courseTitle,
      publicVerificationCode: p.publicCode,
      pdfUrl: p.pdfUrl ?? null,
      completedAt: new Date(p.issuedAt),
    },
    update: {},
  });
}

async function handleQuizAttempt(event: AcademyEvent) {
  const p = event.payload as {
    quizId: string;
    quizTitle: string;
    courseId: string;
    scorePct: number;
    earnedMarks: number;
    totalMarks: number;
    passed: boolean;
    submittedAt: string;
  };
  await db.learningCredential.upsert({
    where: { sourceEventId: event.id },
    create: {
      userId: event.subjectId,
      sourceSystem: "academy",
      sourceId: `${p.courseId}:${p.quizId}`,
      sourceEventId: event.id,
      kind: p.passed ? "QUIZ_PASSED" : "QUIZ_FAILED",
      title: p.quizTitle,
      scorePct: p.scorePct,
      completedAt: new Date(p.submittedAt),
    },
    update: {},
  });
}

async function handleProjectGraded(event: AcademyEvent) {
  const p = event.payload as {
    assignmentId: string;
    assignmentTitle: string;
    earnedMarks: number;
    maxMarks: number;
    gradedAt: string;
  };
  await db.learningCredential.upsert({
    where: { sourceEventId: event.id },
    create: {
      userId: event.subjectId,
      sourceSystem: "academy",
      sourceId: p.assignmentId,
      sourceEventId: event.id,
      kind: "PROJECT",
      title: p.assignmentTitle,
      scorePct: p.maxMarks > 0 ? (p.earnedMarks / p.maxMarks) * 100 : null,
      completedAt: new Date(p.gradedAt),
    },
    update: {},
  });
}

async function handleProfileUpdated(event: AcademyEvent) {
  const p = event.payload as {
    name?: string;
    phone?: string;
    photoUrl?: string;
  };
  // Profile updates are bidirectional. Careers MUST NOT update fields it
  // considers authoritative (resume, headline, skills). Only mirror the
  // shared basics — last-write-wins is fine for display name / phone /
  // photo since neither domain has a strong opinion.
  await db.user.update({
    where: { id: event.subjectId },
    data: {
      ...(p.name && { name: p.name }),
      ...(p.phone && { phone: p.phone }),
      ...(p.photoUrl && { image: p.photoUrl }),
    },
  });
}
