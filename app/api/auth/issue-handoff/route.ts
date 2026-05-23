// careers-side: POST/GET /api/auth/issue-handoff
//
// Same shape as academy's. Issues a JWT addressed TO academy.
//
// Auth required (careers session). On success returns either:
//   - JSON { url, token, expiresAtMs, nonce } for POST
//   - 302 redirect to the academy consume URL for GET
//
// See academy's app/api/auth/issue-handoff/route.ts for the doc-block
// rationale; this file is the careers-side mirror.

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { issueHandoff } from "@/lib/handoff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isSafeRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let next = "/";
  try {
    const body = await request.json();
    if (isSafeRelativePath(body?.next)) next = body.next;
  } catch {
    // ignore non-JSON body
  }

  const handoff = await issueHandoff({
    userId: session.user.id,
    next,
    audience: "academy",
    targetBaseUrl: env.ACADEMY_PUBLIC_URL,
    issuer: "careers",
  });

  return NextResponse.json(
    {
      url: handoff.url,
      token: handoff.token,
      expiresAtMs: handoff.expiresAtMs,
      nonce: handoff.nonce,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    // Use env.NEXT_PUBLIC_APP_URL (careers' canonical origin) rather than
    // request.nextUrl.origin — the latter may resolve to the internal Node
    // bind address depending on proxy header config.
    const signinUrl = new URL("/signin", env.NEXT_PUBLIC_APP_URL);
    signinUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(signinUrl, 302);
  }

  const next = request.nextUrl.searchParams.get("next");
  const safeNext = isSafeRelativePath(next) ? next : "/";

  const handoff = await issueHandoff({
    userId: session.user.id,
    next: safeNext,
    audience: "academy",
    targetBaseUrl: env.ACADEMY_PUBLIC_URL,
    issuer: "careers",
  });

  return NextResponse.redirect(handoff.url, 302);
}
