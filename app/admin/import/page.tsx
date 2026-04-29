import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminShell } from "@/components/layout/admin-shell";
import { SendAllClaimEmailsForm, ResendClaimForm } from "@/components/admin/SendClaimEmailsButton";
import { activeMailProvider } from "@/lib/mail";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "WordPress import" };

export default async function ImportPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  // Counts of imported entities + claim status. The script writes wpLegacyId
  // on every imported row; this page is the operator's at-a-glance view.
  const [
    importedUsers, claimedUsers, importedCompanies, importedJobs, recentlyClaimed, neverClaimed,
  ] = await Promise.all([
    db.user.count({ where: { wpLegacyId: { not: null } } }),
    db.user.count({ where: { wpLegacyId: { not: null }, wpClaimedAt: { not: null } } }),
    db.company.count({ where: { wpLegacyId: { not: null } } }),
    db.jobPosting.count({ where: { wpLegacyId: { not: null } } }),
    db.user.findMany({
      where: { wpLegacyId: { not: null }, wpClaimedAt: { not: null } },
      orderBy: { wpClaimedAt: "desc" },
      take: 8,
      select: { id: true, email: true, name: true, wpClaimedAt: true },
    }),
    db.user.findMany({
      where: { wpLegacyId: { not: null }, wpClaimedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
  ]);

  const pendingCount = importedUsers - claimedUsers;
  const provider = activeMailProvider();

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-6">
        <header>
          <h1 className="text-dashboard text-emce-text md:text-3xl">WordPress import</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Status of the migration from the legacy <code className="rounded bg-emce-light-soft px-1">emobility.careers</code> WordPress install.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-4">
          <KPI label="Users imported" value={importedUsers} />
          <KPI label="Users claimed" value={claimedUsers} sub={importedUsers > 0 ? `${Math.round((claimedUsers / importedUsers) * 100)}%` : "—"} />
          <KPI label="Companies imported" value={importedCompanies} />
          <KPI label="Jobs imported" value={importedJobs} />
        </div>

        <Card>
          <h2 className="text-section text-emce-text">Run the importer</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            The bulk SQL importer has to run on the server (it needs read access to the WordPress MySQL database). SSH in and run one of:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md bg-emce-darkest p-3 font-mono text-xs text-white">
{`# Dry run — see what would happen, no writes
pnpm wp:import --phase=all --dry-run

# Run for real, in order: users → companies → jobs
pnpm wp:import --phase=users
pnpm wp:import --phase=companies
pnpm wp:import --phase=jobs

# Or all in one shot
pnpm wp:import --phase=all`}
          </pre>
          <p className="mt-3 text-hint text-emce-text-sec">
            Required env vars: <code>WP_DB_HOST</code>, <code>WP_DB_USER</code>, <code>WP_DB_PASSWORD</code>, <code>WP_DB_NAME</code>. Defaults to <code>wp_</code> table prefix and <code>job_listing</code> / <code>company</code> custom post types — change these in <code>scripts/import-wordpress.ts</code> if your plugin diverges.
          </p>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-section text-emce-text">Step 2: invite imported users</h2>
              <p className="mt-1 text-sm text-emce-text-sec">
                Imported users have no password (we don't migrate WordPress's <code>phpass</code> hashes). They claim their account by clicking a magic-link email.
              </p>
            </div>
            <Badge variant={provider === "ses" ? "verified" : provider === "resend" ? "warning" : "outline"} className="text-[10px]">
              Mail: {provider === "ses" ? "Amazon SES" : provider === "resend" ? "Resend (fallback)" : "Not configured"}
            </Badge>
          </div>
          <div className="mt-3">
            <SendAllClaimEmailsForm pendingCount={pendingCount} />
          </div>
          <p className="mt-3 text-hint text-emce-text-sec">
            You can also run <code className="rounded bg-emce-light-soft px-1">pnpm wp:claim-emails</code> from the server CLI for batched throttling. Tokens are good for 7 days.
          </p>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-section text-emce-text">Pending claims ({pendingCount})</h2>
            {neverClaimed.length === 0 ? (
              <EmptyState className="border-0 p-6" icon="✅" title={pendingCount === 0 ? "All done" : "Loaded all pending"} body={pendingCount === 0 ? "Every imported user has signed in at least once." : undefined} />
            ) : (
              <ul className="mt-3 divide-y divide-emce-border text-sm">
                {neverClaimed.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <div className="font-bold text-emce-text">{u.name ?? u.email}</div>
                      <div className="text-hint text-emce-text-sec">{u.email} · {u.role.toLowerCase()} · imported {relativeTime(u.createdAt)}</div>
                    </div>
                    <ResendClaimForm userId={u.id} email={u.email} />
                  </li>
                ))}
              </ul>
            )}
            {pendingCount > 50 && (
              <p className="mt-3 text-hint text-emce-text-sec">Showing the first 50. Use the bulk button above to email everyone.</p>
            )}
          </Card>

          <Card>
            <h2 className="text-section text-emce-text">Recently claimed</h2>
            {recentlyClaimed.length === 0 ? (
              <EmptyState className="border-0 p-6" icon="—" title="Nothing yet" body="Once users start clicking their claim links they'll show up here." />
            ) : (
              <ul className="mt-3 divide-y divide-emce-border text-sm">
                {recentlyClaimed.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/admin/users/${u.id}`} className="font-bold text-emce-text hover:underline">{u.name ?? u.email}</Link>
                      <div className="text-hint text-emce-text-sec">{u.email}</div>
                    </div>
                    <span className="text-[10px] uppercase text-emce-text-sec">{relativeTime(u.wpClaimedAt!)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="bg-emce-light-soft">
          <h2 className="text-section text-emce-text">Out-of-script work</h2>
          <p className="mt-1 text-sm text-emce-text-sec">
            The importer copies resume URLs as-is — they keep working as long as the WP install stays up. To move resumes / logos / banners into your MinIO bucket so they survive WordPress decommissioning, follow the asset-migration block at the bottom of <code>scripts/import-wordpress.ts</code>.
          </p>
        </Card>
      </div>
    </AdminShell>
  );
}

function KPI({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-emce-border bg-white p-4">
      <div className="text-[10px] uppercase tracking-wide text-emce-text-sec">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-emce-text">{value.toLocaleString()}</span>
        {sub && <span className="text-xs font-bold text-emce-text-sec">{sub}</span>}
      </div>
    </div>
  );
}
