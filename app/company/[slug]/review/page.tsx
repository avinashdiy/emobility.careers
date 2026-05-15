import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { CompanyReviewForm } from "@/components/reviews/CompanyReviewForm";

export const metadata = {
  title: "Write a review",
  robots: { index: false, follow: false },
};

export default async function CompanyReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const company = await db.company.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, logoUrl: true, verificationStatus: true },
  });
  if (!company || company.verificationStatus === "REJECTED") notFound();

  return (
    <>
      <SiteHeader />
      <main className="container max-w-2xl py-10">
        <Link
          href={`/company/${company.slug}`}
          className="text-hint font-bold text-emce-dark hover:underline"
        >
          ← Back to {company.name}
        </Link>

        <header className="mt-4 flex items-center gap-3 animate-fade-up">
          <Avatar src={company.logoUrl} name={company.name} size="lg" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              Write a review
            </p>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
              {company.name}
            </h1>
          </div>
        </header>

        <Card animate className="mt-6">
          <p className="text-hint text-emce-text-sec">
            Reviews are anonymous on the public profile. Signed-in reviewers
            get a "verified employee" pill when their EmployerProfile matches.
            All reviews go through a 24-hour moderation pass to filter
            personal attacks + competitor sniping.
          </p>
          <div className="mt-4">
            <CompanyReviewForm companyId={company.id} companyName={company.name} />
          </div>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
