import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";

/**
 * Server-side guard for role-protected pages.
 * Use in a server component / layout:
 *
 *   const session = await requireRole("EMPLOYER");
 */
export async function requireRole(
  role: Role | Role[],
  redirectTo = "/signin",
) {
  const session = await auth();
  if (!session?.user) redirect(`${redirectTo}?next=${encodeURIComponent("/")}`);

  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(session.user.role)) redirect("/403");

  return session;
}

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function requireAuth(redirectTo = "/signin") {
  const session = await auth();
  if (!session?.user) redirect(redirectTo);
  return session;
}
