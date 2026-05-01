import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminShell } from "@/components/layout/admin-shell";
import { SQLConsole } from "@/components/admin/SQLConsole";

export const metadata = { title: "SQL console" };

export default async function SQLConsolePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">SQL console</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Read-only Postgres console for incident-response lookups. Every query
          (run or rejected) is audit-logged with your admin id. Use it for
          quick ad-hoc reads — for analytics, prefer{" "}
          <a href="/admin/analytics" className="font-bold text-emce-dark underline">
            /admin/analytics
          </a>.
        </p>
        <div className="mt-6">
          <SQLConsole />
        </div>
      </div>
    </AdminShell>
  );
}
