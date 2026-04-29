import { NextResponse } from "next/server";
import { getResumeDownloadUrl } from "@/server/candidates/actions";

// AWS SDK v3 needs the Node runtime — used inside getResumeDownloadUrl
// to mint the presigned download URL.
export const runtime = "nodejs";

/**
 * Auth-checked résumé download for the public profile (`/api/resume/{slug}`).
 *
 * Why an indirection: the value stored on `candidateProfile.resumeUrl`
 * is a bare bucket key (e.g. `resumes/cm.../2026-04-29/abc.pdf`), and
 * the value on `aiResumeUrl` is the same shape. Neither is a fetchable
 * URL — résumés are sensitive, sit in a private bucket, and are served
 * via a short-lived presigned URL after a visibility check. This
 * route does the lookup + the check + the presign in one place so
 * the public profile can just point its "Download résumé" button at
 * `/api/resume/{slug}`.
 *
 * `getResumeDownloadUrl` returns null when the viewer fails the
 * `cvVisibility` gate — we 404 in that case rather than returning a
 * helpful error, so the URL doesn't leak the existence of the file.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = await getResumeDownloadUrl({ candidateSlug: slug });
  if (!url) {
    // Same response for "no résumé", "private", "no permission", or
    // "candidate doesn't exist" — keeps the URL non-revealing.
    return new NextResponse("Not found", { status: 404 });
  }
  // 302 because the presigned URL is short-lived (5 min); we don't
  // want browsers / shares to cache it past expiry.
  return NextResponse.redirect(url, 302);
}
