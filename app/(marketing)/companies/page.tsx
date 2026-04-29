import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "EV companies hiring" };

export default async function CompaniesPage() {
  const companies = await db.company.findMany({
    where: { verificationStatus: "VERIFIED" },
    include: { _count: { select: { jobs: { where: { status: "OPEN" } } } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="container py-10">
      <Badge variant="default">Companies</Badge>
      <h1 className="mt-2 text-dashboard text-emce-text md:text-3xl">
        EV companies hiring on emobility.careers
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Explore verified EV-industry employers — from startups to OEMs to charging operators.
      </p>

      {companies.length === 0 ? (
        <Card className="mt-6 p-10 text-center">
          <div className="text-4xl">🏢</div>
          <p className="mt-3 text-section text-emce-text">No verified companies yet</p>
          <p className="mt-1 text-hint text-emce-text-sec">Check back soon!</p>
        </Card>
      ) : (
        <ul className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <li key={c.id}>
              <Link href={`/company/${c.slug}`}>
                <Card className="h-full">
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
