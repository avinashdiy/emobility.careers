import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyEmail } from "@/server/auth/actions";
import { VerifyEmailBanner } from "@/components/auth/VerifyEmailBanner";

export const metadata = { title: "Verify email", robots: { index: false, follow: false } };

/**
 * Three modes for this page:
 *
 *   1. With ?token=… — consume the token, verify, show "✓ Verified".
 *      Reached by clicking the link in the verification email.
 *
 *   2. No token, signed-in, email already verified —
 *      "Already verified ✓" + dashboard CTA.
 *
 *   3. No token, signed-in, email NOT yet verified —
 *      Render <VerifyEmailBanner> with the resend CTA. This is the
 *      destination for the "Verify your email" link in the profile-
 *      completeness card; previously it just showed "invalid link"
 *      which gave users no way to actually verify.
 *
 *   4. No token, signed-out — sign-in prompt.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Token mode — consume immediately.
  if (token) {
    const result = await verifyEmail(token);
    return (
      <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
        <Card className="max-w-md p-8 text-center">
          {result.ok ? (
            <>
              <div className="mb-3 text-5xl">✓</div>
              <h1 className="text-2xl font-extrabold text-emce-text">Email verified</h1>
              <p className="mt-2 text-emce-text-sec">
                Thanks{result.email ? ` — ${result.email} is confirmed` : ""}. You can
                now apply to jobs and post listings.
              </p>
              <Button asChild className="mt-6">
                <Link href="/me">Go to dashboard →</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="mb-3 text-5xl">⚠️</div>
              <h1 className="text-2xl font-extrabold text-emce-text">
                Verification link invalid
              </h1>
              <p className="mt-2 text-emce-text-sec">
                This link has expired or has already been used. Sign in and tap{" "}
                <strong>Send verification email</strong> from your dashboard to get a
                fresh one.
              </p>
              <Button asChild className="mt-6">
                <Link href="/signin?next=/verify-email">Sign in</Link>
              </Button>
            </>
          )}
        </Card>
      </main>
    );
  }

  // No token — figure out the user's state.
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-2xl font-extrabold text-emce-text">Verify your email</h1>
          <p className="mt-2 text-emce-text-sec">
            Sign in first — we&apos;ll send a fresh verification link to your inbox.
          </p>
          <Button asChild className="mt-6">
            <Link href="/signin?next=/verify-email">Sign in</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerifiedAt: true },
  });

  if (user?.emailVerifiedAt) {
    return (
      <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
        <Card className="max-w-md p-8 text-center">
          <div className="mb-3 text-5xl">✓</div>
          <h1 className="text-2xl font-extrabold text-emce-text">
            Already verified
          </h1>
          <p className="mt-2 text-emce-text-sec">
            {user.email} is confirmed. Nothing to do here.
          </p>
          <Button asChild className="mt-6">
            <Link href="/me">Go to dashboard →</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
      <Card className="max-w-md p-8">
        <h1 className="text-center text-2xl font-extrabold text-emce-text">
          Verify your email
        </h1>
        <p className="mt-2 text-center text-emce-text-sec">
          Verifying unlocks job applications, posting, messaging, and connection
          requests.
        </p>
        <div className="mt-5">
          <VerifyEmailBanner email={user?.email ?? session.user.email ?? ""} />
        </div>
        <p className="mt-2 text-center text-hint text-emce-text-muted">
          Didn&apos;t get the link?{" "}
          <Link href="/contact" className="font-bold text-emce-dark hover:underline">
            Contact support
          </Link>{" "}
          and we&apos;ll set it manually.
        </p>
      </Card>
    </main>
  );
}
