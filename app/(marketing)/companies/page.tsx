import Link from "next/link";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { AnimatedNumber } from "@/components/ui/animated-number";

export const metadata = { title: "EV companies hiring" };

export default async function CompaniesPage() {
  const companies = await db.company.findMany({
    where: { verificationStatus: "VERIFIED" },
    include: { _count: { select: { jobs: { where: { status: "OPEN" } } } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="container py-10">
      <PageHeader
        eyebrow="Companies"
        title={`EV companies hiring on emobility.careers`}
        accent="hiring"
        subtitle={
          <>
            <AnimatedNumber to={companies.length} />{" "}
            verified EV-industry employers — from startups to OEMs to charging operators.
          </>
        }
      />

      {companies.length === 0 ? (
        <EmptyState
          variant="mesh"
          icon="🏢"
          title="No verified companies yet"
          body="Check back soon — verified EV employers are landing every week."
          className="mt-6"
        />
      ) : (
        <ul className="emce-stagger mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.id}>
              <Link href={`/company/${c.slug}`}>
                <Card variant="interactive" className="h-full">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-md bg-emce-light-soft text-base font-extrabold text-emce-dark">
                      {c.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.logoUrl} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        c.name[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-emce-text">{c.name}</h3>
                      <p className="text-hint text-emce-text-sec">
                        {c.companyType} {c.hqLocation && `· ${c.hqLocation}`}
                      </p>
                    </div>
                  </div>
                  {c.description && (
                    <p className="mt-3 line-clamp-2 text-body text-emce-text-sec">{c.description}</p>
                  )}
                  <div className="mt-3">
                    <Badge variant="success">{c._count.jobs} open job{c._count.jobs === 1 ? "" : "s"}</Badge>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
