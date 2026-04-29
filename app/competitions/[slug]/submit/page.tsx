import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getCompetitionBySlug, getMyRegistration } from "@/server/competitions/queries";
import { SubmissionForm } from "@/components/competitions/SubmissionForm";

export const metadata = { title: "Submit entry" };

export default async function SubmitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/competitions/${slug}/submit`);
  const c = await getCompetitionBySlug(slug);
  if (!c) notFound();
  const myReg = await getMyRegistration(c.id, session.user.id);
  if (!myReg) redirect(`/competitions/${slug}/register`);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-3xl space-y-4 py-6 md:py-8">
        <div>
          <h1 className="text-dashboard text-emce-text md:text-3xl">{c.title}</h1>
          <p className="mt-1 text-sm text-emce-text-sec">Submitting as {myReg.teamName ?? "solo"}</p>
        </div>
        <SubmissionForm
          registrationId={myReg.id}
          stages={c.stages}
          existing={myReg.submissions}
        />
      </div>
      <SiteFooter />
    </>
  );
}
