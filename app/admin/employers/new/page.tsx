import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { adminProvisionHr } from "@/server/admin/recruiting-actions";

export const metadata = { title: "Admin · Provision HR account" };

interface ProvisionedCreds {
  email: string;
  tempPassword: string;
  userId: string;
}

/**
 * Admin HR provisioning page. Creates a User (role=EMPLOYER) +
 * EmployerProfile linking them to a company, with a one-time
 * provisional password admin can share with the HR. After provisioning
 * the action redirects back here with `?provisioned=<json>` so the
 * credentials surface in a copy-able callout — ONCE. Reload of the
 * page after this won't re-show the password (we don't store
 * plaintext); admin can hit "reset password" from /admin/employers
 * if it gets lost.
 */
export default async function AdminProvisionHrPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provisioned?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const companies = await db.company.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  let creds: ProvisionedCreds | null = null;
  if (sp.provisioned) {
    try {
      creds = JSON.parse(sp.provisioned) as ProvisionedCreds;
    } catch {
      creds = null;
    }
  }

  return (
    <AdminShell>
      <div className="container max-w-2xl py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">Provision HR / Employer login</h1>
            <p className="mt-1 text-sm text-emce-text-sec">
              Create an EMPLOYER account on behalf of a company HR. The
              system generates a one-time temporary password — share it
              with the HR over the channel of your choice. They log in,
              hit <em>/employer</em>, and start reviewing applicants.
            </p>
          </div>
          <Link href="/admin/employers" className="shrink-0 text-sm font-bold text-emce-dark hover:underline">
            ← Back
          </Link>
        </div>

        {sp.error && (
          <div className="mb-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        {/* Credentials callout — shown once, after a successful provision.
            Plaintext password is never stored, so a refresh wipes this. */}
        {creds && (
          <Card className="mb-6 border-2 border-emce-mid bg-emce-light-soft p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔑</span>
              <div className="flex-1">
                <h2 className="text-section font-extrabold text-emce-darkest">
                  Account ready · share these credentials once
                </h2>
                <p className="mt-1 text-sm text-emce-text-sec">
                  These won&apos;t be visible again after you leave this page —
                  copy them now. The HR signs in at{" "}
                  <Link href="/signin" className="font-bold underline">/signin</Link>{" "}
                  and lands on <code>/employer</code>.
                </p>
                {/* `min-w-0` on the dd cells lets long emails / cuids
                    wrap inside the narrow second column on mobile;
                    without it the monospace text forces horizontal
                    scroll. `break-all` is the right break rule for
                    monospace tokens that have no natural break points. */}
                <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="font-bold text-emce-text">Email</dt>
                  <dd className="min-w-0 break-all font-mono">{creds.email}</dd>
                  <dt className="font-bold text-emce-text">Temp password</dt>
                  <dd className="min-w-0 break-all font-mono select-all">{creds.tempPassword}</dd>
                  <dt className="font-bold text-emce-text">User ID</dt>
                  <dd className="min-w-0 break-all font-mono text-emce-text-sec">{creds.userId}</dd>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="warning">Single-use disclosure</Badge>
                  <Badge variant="default">EMPLOYER role</Badge>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="p-6">
          <form action={adminProvisionHr} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="email">HR email</Label>
              <Input id="email" name="email" type="email" required placeholder="hr@company.com" />
            </div>
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required minLength={2} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="designation">Designation</Label>
              <Input id="designation" name="designation" placeholder="HR Lead / Talent Acquisition" />
            </div>

            {/* ── Company picker ──────────────────────────── */}
            <div className="sm:col-span-2">
              <Label htmlFor="companyId">Company (existing)</Label>
              <NativeSelect id="companyId" name="companyId">
                <option value="">— Pick one or fill new-company section below —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* ── Inline new-company ──────────────────────── */}
            <details className="sm:col-span-2 rounded-md border border-emce-border bg-emce-bg p-4">
              <summary className="cursor-pointer text-sm font-bold text-emce-text">
                Or create a new company inline
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="newCompanyName">Company name</Label>
                  <Input id="newCompanyName" name="newCompanyName" maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="newCompanyType">Company type</Label>
                  <NativeSelect id="newCompanyType" name="newCompanyType">
                    <option value="">—</option>
                    <option value="OEM">OEM</option>
                    <option value="STARTUP">Startup</option>
                    <option value="TIER1">Tier-1</option>
                    <option value="TIER2">Tier-2</option>
                    <option value="BATTERY">Battery</option>
                    <option value="CHARGING">Charging</option>
                    <option value="FLEET">Fleet / Mobility</option>
                    <option value="CONSULTING">Consulting / Services</option>
                    <option value="OTHER">Other</option>
                  </NativeSelect>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="newCompanyWebsite">Website</Label>
                  <Input id="newCompanyWebsite" name="newCompanyWebsite" type="url" placeholder="https://..." />
                </div>
              </div>
            </details>

            {/* ── Team role ───────────────────────────────── */}
            <div>
              <Label htmlFor="teamRole">Team role</Label>
              <NativeSelect id="teamRole" name="teamRole" defaultValue="RECRUITER">
                <option value="RECRUITER">Recruiter</option>
                <option value="HIRING_MANAGER">Hiring Manager</option>
                <option value="ADMIN">Company Admin</option>
                <option value="VIEWER">Viewer (read-only)</option>
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-emce-text-sec">
              <input type="checkbox" name="isCompanyAdmin" value="true" />
              Make company admin (can invite teammates)
            </label>

            <div className="sm:col-span-2 mt-2">
              <Button type="submit" size="lg" className="w-full sm:w-auto">
                Create account & generate password
              </Button>
            </div>
          </form>
        </Card>

        <p className="mt-6 text-hint text-emce-text-sec">
          Tip: existing employer accounts can have their password rotated from{" "}
          <Link href="/admin/employers" className="font-bold text-emce-dark hover:underline">/admin/employers</Link>.
        </p>
      </div>
    </AdminShell>
  );
}
