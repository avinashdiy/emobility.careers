/**
 * Shared helpers for server-action error handling.
 *
 * The bug they prevent: a server action returns a result tuple
 * (`{ ok, message }`) and is called from a client component via
 * `startTransition(async () => { const r = await myAction(...) })`.
 * If the action throws unexpectedly (DB constraint violation,
 * MinIO outage, Redis blip, schema drift on prod), the throw
 * propagates through `startTransition` and Next.js renders the
 * global `error.tsx` page instead of the user seeing a friendly
 * toast.
 *
 * Pattern to use in any such action:
 *
 *   import { isRouterControlError } from "@/lib/server-action-errors";
 *   import { logger } from "@/lib/logger";
 *
 *   export async function doThing(...): Promise<{ ok; message }> {
 *     try {
 *       // ...action logic...
 *       return { ok: true, message: "Done." };
 *     } catch (err) {
 *       if (isRouterControlError(err)) throw err;
 *       logger.error({ err }, "[do-thing] unhandled");
 *       return { ok: false, message: "Couldn't process — try again." };
 *     }
 *   }
 *
 * The re-throw of router control errors is critical — `redirect()`
 * and `notFound()` from `next/navigation` both throw an Error whose
 * `digest` field marks it as a framework signal. Eating these would
 * break sign-in redirects, 404s, and persona-promotion flows.
 */

export function isRouterControlError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const digest = (err as { digest?: string }).digest;
  return (
    digest?.startsWith("NEXT_REDIRECT") === true ||
    digest === "NEXT_NOT_FOUND" ||
    err.message === "NEXT_REDIRECT"
  );
}
