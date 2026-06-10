import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SubmitButton } from "@/components/ui/submit-button";
import { signOutAction } from "@/server/auth/actions";
import { getUserMenuViewerData } from "@/lib/header-user-menu-data";

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
 *     Stay signed in). The Sign out button runs signOutAction, which
 *     clears the session and redirects to the homepage (a DIFFERENT
 *     URL — redirecting back here would be a same-URL no-op that hangs
 *     the submit button's pending state).
 *   • Signed out → a "see you soon" acknowledgment with sign-back-in +
 *     homepage CTAs. Shown on a direct visit to /signout while already
 *     logged out (the normal flow lands on "/").
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
  // Resolve the avatar from the SAME canonical source as the header
  // (candidateProfile.profilePhotoUrl in MinIO, else the employer
  // company logo) — NOT session.user.image, which for this platform is
  // often a stale OAuth/import path (e.g. a /media/avatars/* file that
  // 404s, or a LinkedIn hotlink that 403s) and rendered as a blank
  // silhouette. getUserMenuViewerData returns the photo the rest of
  // the app already shows for this user.
  const viewer = await getUserMenuViewerData({
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: (session.user as { role?: string }).role ?? "CANDIDATE",
  });
  const fullName = viewer?.name ?? session.user.name ?? null;
  const email = viewer?.email || session.user.email || null;
  const avatarUrl = viewer?.avatarUrl ?? viewer?.employerCompany?.logoUrl ?? undefined;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <Card className="p-8 text-center">
      <div className="flex flex-col items-center">
        <Avatar
          src={avatarUrl}
          name={fullName ?? email ?? "You"}
          size="lg"
        />
        <h1 className="mt-4 text-2xl font-extrabold text-emce-text">
          {firstName ? `Sign out, ${firstName}?` : "Sign out?"}
        </h1>
        <p className="mt-2 text-sm text-emce-text-sec">
          You&apos;re currently signed in
          {email ? (
            <>
              {" "}as{" "}
              <span className="font-semibold text-emce-text">
                {email}
              </span>
            </>
          ) : null}
          . You can sign back in anytime.
        </p>
      </div>

      <form action={signOutAction} className="mt-6">
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
