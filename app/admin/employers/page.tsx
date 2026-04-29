import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { AdminShell } from "@/components/layout/admin-shell";
import { setCompanyVerification } from "@/server/admin/actions";
import { adminResetEmployerPassword } from "@/server/admin/recruiting-actions";

export const metadata = { title: "Employer KYC queue" };

interface ProvisionedCreds {
  email: string;
  tempPassword: string;
  userId: string;
}

export default async function AdminEmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ provisioned?: string; error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  let creds: ProvisionedCreds | null = null;
  if (sp.provisioned) {
    try {
      creds = JSON.parse(sp.provisioned) as ProvisionedCreds;
    } catch {
      creds = null;
    }
  }

  const [companies, employers] = await Promise.all([
    db.company.findMany({
      orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        owner: { select: { email: true, name: true } },
        _count: { select: { jobs: true, team: true } },
      },
    }),
    // Recent EmployerProfiles — surfaces freshly provisioned HR
    // accounts so admin can rotate passwords with one click if the
    // initial credentials get lost in the share channel.
    db.employerProfile.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        user: { select: { id: true, email: true, name: true, lastLoginAt: true } },
        company: { select: { name: true, slug: true } },
      },
    }),
  ]);

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-dashboard text-emce-text">Employers / company KYC</h1>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/admin/employers/new">+ Provision HR account</Link>
          </Button>
        </div>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        {creds && (
          <Card className="mt-4 border-2 border-emce-mid bg-emce-light-soft p-6">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔑</span>
              <div className="flex-1">
                <h2 className="text-section font-extrabold text-emce-darkest">
                  New temp password · share once
                </h2>
                <p className="mt-1 text-sm text-emce-text-sec">
                  Won&apos;t be visible again after you leave this page.
                </p>
                <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="font-bold text-emce-text">Email</dt>
                  <dd className="min-w-0 break-all font-mono">{creds.email}</dd>
                  <dt className="font-bold text-emce-text">Temp password</dt>
                  <dd className="min-w-0 break-all font-mono select-all">{creds.tempPassword}</dd>
                </dl>
              </div>
            </div>
          </Card>
        )}

        <h2 className="mt-8 text-section text-emce-text">Companies</h2>

        <ul className="mt-6 space-y-3">
          {companies.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link href={`/company/${c.slug}`} className="font-bold text-emce-text hover:underline">
                        {c.name}
                      </Link>
                      <Badge variant={
                        c.verificationStatus === "VERIFIED" ? "success"
                        : c.verificationStatus === "PENDING" ? "warning"
                        : c.verificationStatus === "REJECTED" ? "danger"
                        : "outline"
                      }>{c.verificationStatus}</Badge>
                    </div>
                    <p className="text-hint text-emce-text-sec">
                      {c.companyType} · {c._count.jobs} jobs · {c._count.team} teammates · owner {c.owner.email}
                    </p>
                    {c.description && <p className="mt-1 text-hint text-emce-text-sec">{c.description}</p>}
                    {c.website && <p className="text-hint text-emce-text-muted">{c.website}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={setCompanyVerification}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <input type="hidden" name="status" value="VERIFIED" />
                      <Button type="submit" size="sm" disabled={c.verificationStatus === "VERIFIED"}>Verify</Button>
                    </form>
                    <form action={setCompanyVerification}>
                      <input type="hidden" name="companyId" value={c.id} />
                      <input type="hidden" name="status" value="REJECTED" />
                      <ConfirmSubmit
                        confirm={`Reject "${c.name}" verification? They won't be able to publish jobs.`}
                        size="sm"
                        variant="destructive"
                        disabled={c.verificationStatus === "REJECTED"}
                      >
                        Reject
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>

        <h2 className="mt-10 text-section text-emce-text">Recently provisioned employer accounts</h2>
        <p className="mt-1 text-sm text-emce-text-sec">
          {employers.length === 0
            ? "No HR accounts yet. Use ‘Provision HR account’ above to create one."
            : `${employers.length} accounts shown. Hit ‘Reset password’ if the HR can’t locate their initial credentials.`}
        </p>
        {employers.length > 0 && (
          <ul className="mt-3 space-y-2">
            {employers.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-emce-text">{e.user.name ?? e.user.email}</div>
                      <p className="text-hint text-emce-text-sec">
                        <span className="font-mono">{e.user.email}</span> · {e.company.name} · {e.teamRole}
                        {e.isCompanyAdmin && " · Co-admin"}
                      </p>
                      <p className="text-hint text-emce-text-muted">
                        {e.user.lastLoginAt
                          ? `Last login ${e.user.lastLoginAt.toISOString().slice(0, 10)}`
                          : "Never logged in yet"}
                      </p>
                    </div>
                    <form action={adminResetEmployerPassword}>
                      <input type="hidden" name="userId" value={e.user.id} />
                      <ConfirmSubmit
                        confirm={`Reset password for ${e.user.email}? A fresh temp password will be generated.`}
                        size="sm"
                        variant="outline"
                      >
                        Reset password
                      </ConfirmSubmit>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
