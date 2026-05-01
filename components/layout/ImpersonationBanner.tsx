import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { stopImpersonation } from "@/server/admin/impersonation";
import { ShieldAlert } from "lucide-react";

/**
 * Sticky red bar shown at the top of every page when the current
 * session is an admin impersonating another user. Renders nothing
 * when the session is plain (zero overhead for normal users).
 *
 * The "Back to admin" form posts to `stopImpersonation` which
 * re-signs the JWT with the original admin's identity. Audit log
 * captures both start + stop with the admin's real id.
 */
export async function ImpersonationBanner() {
  const session = await auth();
  if (!session?.user?.impersonatedBy) return null;

  const target = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      role: true,
      candidateProfile: { select: { firstName: true, lastName: true } },
    },
  });
  const displayName = target?.candidateProfile
    ? `${target.candidateProfile.firstName} ${target.candidateProfile.lastName ?? ""}`.trim()
    : target?.name ?? target?.email ?? "user";

  return (
    <div
      role="alert"
      aria-live="polite"
      // Red bar — visually loud on purpose. The admin's own admin chrome
      // is hidden under this banner; we want them to never forget that
      // their actions are being attributed to someone else.
      className="sticky top-0 z-50 flex items-center gap-3 border-b border-emce-red bg-emce-red px-4 py-2 text-sm text-white"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong>Impersonating</strong>{" "}
        <span className="font-bold">{displayName}</span>{" "}
        <span className="hidden sm:inline">
          ({target?.email}) — every action is audit-logged against your admin id.
        </span>
      </span>
      <form action={stopImpersonation} className="shrink-0">
        <button
          type="submit"
          className="rounded-md bg-white/20 px-3 py-1 text-xs font-bold text-white hover:bg-white/30"
        >
          Back to admin →
        </button>
      </form>
    </div>
  );
}
