import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { InstitutionReviewForm } from "@/components/reviews/InstitutionReviewForm";

export const metadata = {
  title: "Write a review",
  robots: { index: false, follow: false },
};

export default async function InstitutionReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const inst = await db.institution.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, logoUrl: true, verificationStatus: true },
  });
  if (!inst || inst.verificationStatus === "REJECTED") notFound();

  return (
    <>
      <SiteHeader />
      <main className="container max-w-2xl py-10">
        <ToastFromSearchParams />
        <Link
          href={`/institutions/${inst.slug}`}
          className="text-hint font-bold text-emce-dark hover:underline"
        >
          ← Back to {inst.name}
        </Link>

        <header className="mt-4 flex items-center gap-3">
          <Avatar src={inst.logoUrl} name={inst.name} size="lg" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
              Write a review
            </p>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
              {inst.name}
            </h1>
          </div>
        </header>

        <Card className="mt-6 p-5">
          <p className="text-hint text-emce-text-sec">
            Reviews are anonymous on the public profile. Signed-in reviewers
            with an Education entry at this institution get a &ldquo;Verified
            alumni&rdquo; pill. All reviews pass through 24-hour moderation
            before going live.
          </p>
          <div className="mt-4">
            <InstitutionReviewForm institutionId={inst.id} institutionName={inst.name} />
          </div>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
