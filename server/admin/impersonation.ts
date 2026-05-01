"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, unstable_update } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Admin "Sign in as <user>" for support debugging. Implementation
 * detail: we hijack the JWT's `sub` (user id) + `role` and stash the
 * original admin id in `impersonatedBy`. The session callback in
 * `lib/auth.config.ts` reads these and surfaces them to every server
 * component / action.
 *
 * Invariants:
 *   • Only ADMIN can start; non-admins 403.
 *   • You can't impersonate another ADMIN (privilege chains aren't
 *     useful and make audit trails confusing — admins debug themselves).
 *   • Every start AND stop is audit-logged with the admin's real id.
 *   • The target user's status / lockout state is irrelevant — admins
 *     impersonate to investigate exactly the broken case.
 *   • Notifications of the impersonation event aren't sent to the user;
 *     admins reading their data is a privacy event we trust the audit
 *     log to capture for legal review.
 */

export async function startImpersonation(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");
  // Belt-and-braces: don't allow stacking impersonations. If we're
  // already impersonating, stop first then reapply.
  if (session.user.impersonatedBy) {
    redirect(
      "/admin/users?error=" +
        encodeURIComponent("Stop your current impersonation first."),
    );
  }
  const targetId = z.string().parse(formData.get("targetId"));

  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!target) {
    redirect("/admin/users?error=" + encodeURIComponent("User not found."));
  }
  if (target.role === "ADMIN") {
    redirect(
      "/admin/users?error=" +
        encodeURIComponent("Refusing to impersonate another admin."),
    );
  }

  await audit({
    actorId: session.user.id,
    action: "admin.impersonation_started",
    entity: "User",
    entityId: target.id,
    meta: { targetEmail: target.email, targetRole: target.role },
  });

  // Re-sign the JWT with the target user's identity. The session
  // callback merges `impersonatedBy` so the next request renders the
  // banner + every server action sees the candidate as the actor.
  try {
    await unstable_update({
      user: {
        id: target.id,
        role: target.role,
        impersonatedBy: session.user.id,
      },
    });
  } catch (err) {
    logger.error({ err, adminId: session.user.id }, "[impersonate] update failed");
    redirect("/admin/users?error=" + encodeURIComponent("Couldn't update session."));
  }

  // Land on the target's dashboard so the admin sees what they see.
  redirect(target.role === "EMPLOYER" ? "/employer" : "/me");
}

export async function stopImpersonation() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const adminId = session.user.impersonatedBy;
  if (!adminId) {
    // Not currently impersonating — bounce back to admin home so the
    // user doesn't get a confusing error page.
    redirect("/admin/users");
  }

  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { id: true, role: true, status: true },
  });
  if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
    // Defensive: if the original admin has been suspended / demoted
    // mid-impersonation, sign-out fully. The next sign-in goes through
    // normal auth flow.
    redirect("/api/auth/signout");
  }

  await audit({
    actorId: admin.id,
    action: "admin.impersonation_stopped",
    entity: "User",
    entityId: session.user.id,
  });

  await unstable_update({
    user: {
      id: admin.id,
      role: admin.role,
      impersonatedBy: null,
    },
  });

  redirect("/admin");
}
