import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getCompetitionBySlug, getMyRegistration } from "@/server/competitions/queries";
import { RegisterForm } from "@/components/competitions/RegisterForm";

export const metadata = { title: "Register" };

export default async function RegisterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/signin?next=/competitions/${slug}/register`);
  const c = await getCompetitionBySlug(slug);
  if (!c) notFound();
  if (c.status !== "LIVE") redirect(`/competitions/${slug}`);

  const existing = await getMyRegistration(c.id, session.user.id);
  if (existing) redirect(`/me/competitions`);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-2xl space-y-4 py-6 md:py-8">
        <div>
          <h1 className="text-dashboard text-emce-text md:text-3xl">{c.title}</h1>
          <p className="mt-1 text-sm text-emce-text-sec">{c.tagline}</p>
        </div>
        <RegisterForm
          competitionId={c.id}
          competitionSlug={c.slug}
          isTeamBased={c.isTeamBased}
          minTeamSize={c.minTeamSize}
          maxTeamSize={c.maxTeamSize}
        />
      </div>
      <SiteFooter />
    </>
  );
}
