import { NextRequest } from "next/server";
import { exportUserData } from "@/server/account/data-rights";

/**
 * Streaming-style JSON download of every row tied to the signed-in
 * user. Admins can download for any user by passing `?targetUserId=`;
 * non-admins are silently scoped to themselves regardless of param.
 *
 * The payload can be large (thousands of posts / messages) so we
 * write a single Content-Disposition: attachment header and let the
 * browser save the file directly.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedTarget = url.searchParams.get("targetUserId") ?? undefined;
  const result = await exportUserData(requestedTarget);
  if (!result.ok) {
    return new Response(result.message ?? "Export failed", { status: 400 });
  }
  const body = JSON.stringify(result.data, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="emobility-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
