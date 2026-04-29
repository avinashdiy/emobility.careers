import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getBooleanSetting, getSetting } from "@/lib/settings";

/**
 * Server-side maintenance gate. When `system.maintenance_mode` is on, every
 * route except `/admin/*` (so the admin can flip the flag back), `/signin`
 * (so the admin can log in), `/403`, `/api/*`, and the standard error pages
 * shows the maintenance page instead of the requested content.
 *
 * Logged-in admins ALWAYS see the real site so they can verify changes
 * during a maintenance window.
 */

const ALWAYS_ALLOWED_PREFIXES = ["/admin", "/signin", "/403", "/api"];

export async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [enabled, message, siteName, session, hdrs] = await Promise.all([
    getBooleanSetting("system.maintenance_mode"),
    getSetting("system.maintenance_message"),
    getSetting("site.name"),
    auth(),
    headers(),
  ]);

  if (!enabled) return <>{children}</>;

  // Admins see the site as-is.
  if (session?.user?.role === "ADMIN") return <>{children}</>;

  const pathname = hdrs.get("x-pathname") ?? "/";
  if (ALWAYS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))) return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center bg-emce-light-bg p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emce-mid">
          <span className="text-2xl">🛠️</span>
        </div>
        <h1 className="mt-4 text-section text-emce-text md:text-2xl">{siteName} is undergoing maintenance</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-emce-text-sec">{message}</p>
        <p className="mt-4 text-hint text-emce-text-sec">
          We'll be back shortly. <a href="/admin" className="font-bold text-emce-dark hover:underline">Admin sign in →</a>
        </p>
      </div>
    </div>
  );
}
