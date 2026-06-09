import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutToConfirmation } from "@/server/auth/actions";

export const metadata: Metadata = {
  title: "Sign out",
  robots: { index: false, follow: false },
};

// Always per-request — depends on the session cookie, and we never
// want a cached "signed in as X" card served to a different visitor.
export const dynamic = "force-dynamic";

/**
 * Branded sign-out experience. Auth.js's default GET /api/auth/signout
 * renders an unstyled blank page with a lone blue button; pages.signOut
 * (lib/auth.config.ts) redirects every logout link here instead.
 *
 * Two states:
 *   • Signed in  → a clean confirmation card (who you are + Sign out /
 *     Stay signed in). The Sign out button runs signOutToConfirmation,
 *     which clears the session and redirects BACK here…
 *   • Signed out → the "see you soon" acknowledgment with sign-back-in
 *     + homepage CTAs.
 *
 * Inherits the (auth) route-group layout — the animated mesh-gradient
 * split screen — so it matches the sign-in page for free.
 */
export default async function SignOutPage() {
  const session = await auth();

  // ── Signed out: acknowledgment + next steps ──────────────────────
  if (!session?.user) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emce-light-soft text-2xl">
          👋
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-emce-text">
          You&apos;re signed out
        </h1>
        <p className="mt-2 text-sm text-emce-text-sec">
          Thanks for stopping by — your session has ended on this device.
          See you again soon.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild size="lg">
            <Link href="/signin">Sign back in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/">Go to homepage</Link>
          </Button>
        </div>
      </Card>
    );
  }

  // ── Signed in: branded confirmation ──────────────────────────────
  const fullName = session.user.name ?? null;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <Card className="p-8 text-center">
      <div className="flex flex-col items-center">
        <Avatar
          src={session.user.image ?? undefined}
          name={fullName ?? session.user.email ?? "You"}
          size="lg"
        />
        <h1 className="mt-4 text-2xl font-extrabold text-emce-text">
          {firstName ? `Sign out, ${firstName}?` : "Sign out?"}
        </h1>
        <p className="mt-2 text-sm text-emce-text-sec">
          You&apos;re currently signed in
          {session.user.email ? (
            <>
              {" "}as{" "}
              <span className="font-semibold text-emce-text">
                {session.user.email}
              </span>
            </>
          ) : null}
          . You can sign back in anytime.
        </p>
      </div>

      <form action={signOutToConfirmation} className="mt-6">
        <SubmitButton className="w-full" size="lg" pendingLabel="Signing you out…">
          Sign out
        </SubmitButton>
      </form>
      <Button asChild size="lg" variant="outline" className="mt-2 w-full">
        <Link href="/me">Stay signed in</Link>
      </Button>
    </Card>
  );
}
