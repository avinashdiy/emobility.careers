import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { acceptTeamInvite } from "@/server/competitions/actions";

export default async function TeamInvitePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const session = await auth();
  if (!session?.user) {
    redirect(`/signin?next=/competitions/${slug}/team-invite/${token}`);
  }

  async function accept() {
    "use server";
    const r = await acceptTeamInvite(token);
    if (r.ok) redirect(`/me/competitions`);
  }

  return (
    <>
      <SiteHeader />
      <div className="container max-w-md py-12">
        <Card>
          <h1 className="text-section text-emce-text">Team invitation</h1>
          <p className="mt-2 text-sm text-emce-text-sec">
            You've been invited to join a team for the competition <strong>{slug}</strong>.
          </p>
          <form action={accept} className="mt-4">
            <Button type="submit" variant="accent" className="w-full">Accept invite</Button>
          </form>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
