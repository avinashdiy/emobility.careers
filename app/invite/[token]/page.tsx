import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/server/employer/team-actions";

export const metadata = { title: "Team invite" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await db.teamInvite.findUnique({
    where: { token },
    include: { company: true, invitedBy: { select: { name: true } } },
  });
  if (!invite) notFound();

  const expired = invite.expiresAt < new Date();
  const accepted = !!invite.acceptedAt;

  const session = await auth();

  if (!session?.user) {
    return (
      <div className="container max-w-md py-20">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-extrabold text-emce-text">You&apos;re invited!</h1>
          <p className="mt-2 text-emce-text-sec">
            <strong>{invite.invitedBy.name ?? "Someone"}</strong> invited you to join{" "}
            <strong>{invite.company.name}</strong> as a {invite.role.toLowerCase()}.
          </p>
          <p className="mt-3 text-hint text-emce-text-sec">Sign in or create an account with <strong>{invite.email}</strong> to accept.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild variant="outline">
              <Link href={`/signin?next=/invite/${token}`}>Sign in</Link>
            </Button>
            <Button asChild>
              <Link href={`/signup?role=EMPLOYER&next=/invite/${token}`}>Create account</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="container max-w-md py-20">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-extrabold text-emce-text">Already accepted</h1>
          <p className="mt-2 text-emce-text-sec">This invite has already been used.</p>
          <Button asChild className="mt-4"><Link href="/employer">Go to dashboard</Link></Button>
        </Card>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="container max-w-md py-20">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-extrabold text-emce-text">Invite expired</h1>
          <p className="mt-2 text-emce-text-sec">Ask the inviter to send a new one.</p>
        </Card>
      </div>
    );
  }

  if (invite.email !== session.user.email?.toLowerCase()) {
    return (
      <div className="container max-w-md py-20">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-extrabold text-emce-text">Wrong account</h1>
          <p className="mt-2 text-emce-text-sec">
            This invite is for <strong>{invite.email}</strong> but you&apos;re signed in as{" "}
            <strong>{session.user.email}</strong>. Sign out and use the right account.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button asChild variant="outline"><Link href="/api/auth/signout">Sign out</Link></Button>
          </div>
        </Card>
      </div>
    );
  }

  if (session.user.role === "ADMIN") redirect("/admin");

  return (
    <div className="container max-w-md py-20">
      <Card className="p-6 text-center">
        <h1 className="text-2xl font-extrabold text-emce-text">Join {invite.company.name}</h1>
        <p className="mt-2 text-emce-text-sec">
          You&apos;ll join as <strong>{invite.role}</strong>. You can post jobs and review candidates for this company.
        </p>
        <form action={acceptInvite} className="mt-4">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" size="lg">Accept &amp; join</Button>
        </form>
      </Card>
    </div>
  );
}
