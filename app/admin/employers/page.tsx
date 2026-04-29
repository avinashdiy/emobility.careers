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

export const metadata = { title: "Employer KYC queue" };

export default async function AdminEmployersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const companies = await db.company.findMany({
    orderBy: [{ verificationStatus: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      owner: { select: { email: true, name: true } },
      _count: { select: { jobs: true, team: true } },
    },
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Employers / company KYC</h1>

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
      </div>
    </AdminShell>
  );
}
