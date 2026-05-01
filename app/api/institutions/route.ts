import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchInstitutions } from "@/lib/institution-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Auth-gated institution autocomplete. The endpoint isn't public
 * because we don't want crawlers / scrapers harvesting our
 * institution list (it's curated work and a small competitive
 * moat). Any signed-in user can call it — it's read-only and the
 * payload contains nothing sensitive.
 *
 * Cache-Control: short (60s) browser-side cache. The list barely
 * changes over a session, but we want admin-added institutions to
 * appear within a reasonable window.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  }
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const results = await searchInstitutions(q);
  return NextResponse.json(
    { results },
    {
      headers: {
        "Cache-Control": "private, max-age=60",
      },
    },
  );
}
