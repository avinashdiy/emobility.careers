// GET /api/applications/[id]/resume-preview
//
// Auth-checked PDF proxy for the application-detail page's resume
// iframe. The previous approach handed the iframe a presigned MinIO
// URL directly, but the URL's `response-content-disposition=inline`
// + `response-content-type=application/pdf` query overrides weren't
// reliably honoured in production (likely a Caddy/MinIO config
// stripping or ignoring them). The result was Chrome seeing the
// default `Content-Disposition: attachment` and refusing to render
// inline — gray-box iframe.
//
// This route bypasses the presigned-URL dance entirely:
//   1. We auth + authz here (same rules as getResumeDownloadUrl)
//   2. Fetch the object server-side via the AWS SDK
//   3. Stream the bytes back with the headers WE set, not whatever
//      MinIO chose to send. `Content-Type: application/pdf` + inline
//      disposition are guaranteed because we write them here.
//
// Word docs are explicitly handled — we serve them with their native
// content-type so the browser handles them sanely (typically a
// download dialog). The page-side rendering branches on file type
// and shouldn't actually call this route for Word resumes (the page
// shows a "Word document — open in new tab" card instead), but
// defence in depth.

import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { s3, buckets } from "@/lib/storage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound(): NextResponse {
  // Single response shape for "no resume", "no permission", "no
  // application" — never leak which case the URL hit. Keeps the
  // route non-revealing for enumeration attempts.
  return new NextResponse("Not found", { status: 404 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: applicationId } = await params;

  const session = await auth();
  if (!session?.user) return notFound();

  // Resolve application + auth check. Same rules as
  // getResumeDownloadUrl's applicationId branch: admin, candidate
  // themselves, or recruiter on the company that posted the job.
  const app = await db.application.findUnique({
    where: { id: applicationId },
    select: {
      resumeSnapshotUrl: true,
      candidate: { select: { userId: true, resumeUrl: true } },
      job: { select: { companyId: true } },
    },
  });
  if (!app) return notFound();

  const candidateUserId = app.candidate.userId;
  if (session.user.role !== "ADMIN" && session.user.id !== candidateUserId) {
    const employer = await db.employerProfile.findUnique({
      where: { userId: session.user.id },
      select: { companyId: true },
    });
    if (!employer || employer.companyId !== app.job.companyId) return notFound();
  }

  const resumeKey = app.resumeSnapshotUrl ?? app.candidate.resumeUrl ?? null;
  if (!resumeKey) return notFound();

  // Normalise to a bare bucket key — three historical shapes have
  // landed in these columns (full URL / bucket-prefixed / bare).
  // Same logic as getResumeDownloadUrl.
  let key = resumeKey;
  const fullUrlMatch = resumeKey.match(/\/[^/]+\/(.+)$/);
  if (resumeKey.startsWith("http")) {
    const after = resumeKey.replace(
      new RegExp(`^https?://[^/]+/${buckets.resumes}/`),
      "",
    );
    if (after !== resumeKey) key = after;
    else if (fullUrlMatch) key = fullUrlMatch[1];
  } else {
    key = resumeKey.replace(new RegExp(`^${buckets.resumes}/`), "");
  }

  // Detect Word docs to pick the right Content-Type. PDFs (and
  // anything not explicitly Word) get `application/pdf` + inline so
  // Chrome's built-in PDF viewer renders inside the iframe.
  const keyForCheck = key.toLowerCase().split("?")[0];
  const isDocx = /\.docx$/.test(keyForCheck);
  const isDoc = /\.doc$/.test(keyForCheck);
  const contentType = isDocx
    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : isDoc
      ? "application/msword"
      : "application/pdf";
  // Word docs get attachment disposition since browsers can't render
  // them inline anyway — sending inline would just leave a broken
  // iframe with no download prompt. PDFs are always inline.
  const disposition = (isDocx || isDoc) ? "attachment" : "inline";
  const filename = isDocx ? "resume.docx" : isDoc ? "resume.doc" : "resume.pdf";

  let body;
  let contentLength: number | undefined;
  try {
    const out = await s3.send(
      new GetObjectCommand({
        Bucket: buckets.resumes,
        Key: key,
      }),
    );
    if (!out.Body) return notFound();
    body = out.Body;
    contentLength = out.ContentLength;
  } catch (err) {
    logger.warn(
      { err, applicationId, key },
      "[resume-preview] S3 GetObject failed",
    );
    return notFound();
  }

  // Buffer the whole file then return. Resumes are <10MB; not worth
  // the streaming complexity. `transformToByteArray()` is part of
  // the AWS SDK v3 streaming-payload utilities — supported on all
  // current SDK versions. Cast through `BodyInit` because TS's
  // tightened Uint8Array<ArrayBufferLike> typing (TS 5.7+) doesn't
  // line up with NextResponse's BodyInit even though Uint8Array is
  // a valid runtime body. Runtime behaviour is correct.
  const bytes = await body.transformToByteArray();

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      ...(contentLength !== undefined
        ? { "Content-Length": String(contentLength) }
        : {}),
      // Resumes are personal data — never let any intermediary
      // (browser, CDN, Caddy) cache them. The auth check above is
      // per-request; a cached response would skip it on subsequent
      // hits and leak the document to anyone who guessed the URL.
      "Cache-Control": "private, no-store",
    },
  });
}
