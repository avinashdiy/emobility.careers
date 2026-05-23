// careers-side: GET /api/auth/consume-handoff?token=<jwt>&next=<path>
//
// Counterpart to academy's consume route. Receives a JWT minted by
// academy's issue-handoff, validates iss/aud/exp/signature, claims the
// nonce in careers' Redis, then calls signIn("handoff", { token, redirectTo: next }).
//
// Requires careers' lib/auth.ts to register the "handoff" Credentials
// provider — see lib/auth.ts.snippet.md in this folder.

import { NextResponse, type NextRequest } from "next/server";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { signIn } from "@/lib/auth";
import { env } from "@/lib/env";
import { verifyHandoff } from "@/lib/handoff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isSafeRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function rejectToSignin(): NextResponse {
  // env.NEXT_PUBLIC_APP_URL is careers' canonical public origin. Don't
  // use request.nextUrl.origin — depending on the proxy chain config it
  // may resolve to the internal Node bind address.
  const url = new URL("/signin", env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("error", "Handoff");
  return NextResponse.redirect(url, 302);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return rejectToSignin();

  let next = "/";
  try {
    const payload = await verifyHandoff({
      token,
      expectedAudience: "careers",
      expectedIssuer: "academy",
    });
    if (isSafeRelativePath(payload.next)) next = payload.next;
  } catch {
    return rejectToSignin();
  }

  try {
    await signIn("handoff", { token, redirectTo: next });
    return rejectToSignin();
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return rejectToSignin();
  }
}
