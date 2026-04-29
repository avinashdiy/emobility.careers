import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobCard } from "@/components/jobs/JobCard";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Globe, MapPin } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const company = await db.company.findUnique({ where: { slug } });
  return company
    ? { title: company.name, description: company.description ?? `${company.name} on eMobility Careers` }
    : { title: "Company not found" };
}

export default async function PublicCompanyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await db.company.findUnique({
    where: { slug },
    include: {
      jobs: {
        where: { status: "OPEN" },
        orderBy: { publishedAt: "desc" },
        take: 20,
        include: { company: { select: { name: true, slug: true, logoUrl: true } } },
      },
    },
  });
  if (!company) notFound();

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    description: company.description ?? company.about ?? undefined,
    url: company.website ?? undefined,
    logo: company.logoUrl ?? undefined,
    image: company.bannerUrl ?? company.logoUrl ?? undefined,
    sameAs: [company.linkedinUrl, company.twitterUrl, company.facebookUrl].filter(Boolean),
    address: company.hqLocation
      ? { "@type": "PostalAddress", addressLocality: company.hqLocation }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <SiteHeader />
      <section
        className={`pb-12 pt-12 text-white ${company.bannerUrl ? "" : "emce-hero-gradient"}`}
        style={
          company.bannerUrl
            ? {
                backgroundImage: `linear-gradient(rgba(30,45,42,0.65),rgba(30,45,42,0.85)), url('${company.bannerUrl}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="container">
          <div className="flex items-start gap-5">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-md bg-white text-2xl font-extrabold text-emce-dark">
              {company.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logoUrl} alt={company.name} className="h-full w-full object-cover" />
              ) : (
                company.name[0]?.toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white md:text-3xl">{company.name}</h1>
              {company.description && <p className="mt-1 text-white/85">{company.description}</p>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-white/80">
                <Badge variant="verified">{company.companyType}</Badge>
                {company.hqLocation && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" /> {company.hqLocation}
                  </span>
                )}
                {company.website && (
                  <a href={company.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-white">
                    <Globe className="h-4 w-4" /> Website
                  </a>
                )}
                {company.teamSize && <span>{company.teamSize} employees</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container max-w-5xl py-10">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {company.about && (
              <Card className="p-6">
                <h2 className="text-section text-emce-text">About</h2>
                <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">{company.about}</p>
              </Card>
            )}

            <Card className="p-6">
              <h2 className="text-section text-emce-text">Open jobs ({company.jobs.length})</h2>
              {company.jobs.length === 0 ? (
                <p className="mt-3 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
                  No open positions right now. Check back soon.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {company.jobs.map((j) => (
                    <li key={j.id}>
                      <JobCard job={j} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <aside className="space-y-4">
            {company.benefits.length > 0 && (
              <Card className="p-6">
                <h3 className="text-section text-emce-text">Benefits</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {company.benefits.map((b) => (
                    <Badge key={b} variant="default">{b}</Badge>
                  ))}
                </div>
              </Card>
            )}
            {company.techStack.length > 0 && (
              <Card className="p-6">
                <h3 className="text-section text-emce-text">Tech / domain</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {company.techStack.map((t) => (
                    <Badge key={t} variant="outline">{t}</Badge>
                  ))}
                </div>
              </Card>
            )}
            <Card className="p-6">
              <h3 className="text-section text-emce-text">Hiring on emobility.careers</h3>
              <p className="mt-2 text-hint text-emce-text-sec">
                Verified employer. Apply with one click using your candidate profile.
              </p>
              <Link
                href="/signup?role=CANDIDATE"
                className="mt-3 inline-block text-hint font-bold text-emce-dark hover:underline"
              >
                Create your candidate profile →
              </Link>
            </Card>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
