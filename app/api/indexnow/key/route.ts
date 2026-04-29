import { NextResponse } from "next/server";

/**
 * IndexNow key verification endpoint. The IndexNow spec lets you put the key
 * file anywhere on the host as long as you specify `keyLocation` in pings —
 * we use this fixed path to avoid colliding with the root-level `[username]`
 * vanity-URL segment.
 *
 *   keyLocation = `${APP_URL}/api/indexnow/key`
 */

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new NextResponse(null, { status: 404 });
  return new NextResponse(key, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
