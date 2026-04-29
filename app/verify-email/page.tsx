import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/server/auth/actions";

export const metadata = { title: "Verify email", robots: { index: false, follow: false } };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyEmail(token) : { ok: false as const };

  return (
    <main className="grid min-h-screen place-items-center bg-emce-light-bg p-6">
      <Card className="max-w-md p-8 text-center">
        {result.ok ? (
          <>
            <div className="mb-3 text-5xl">✓</div>
            <h1 className="text-2xl font-extrabold text-emce-text">Email verified</h1>
            <p className="mt-2 text-emce-text-sec">
              Thanks{result.email ? ` — ${result.email} is confirmed` : ""}. You can now apply to jobs and post listings.
            </p>
            <Button asChild className="mt-6">
              <Link href="/me">Go to dashboard →</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="mb-3 text-5xl">⚠️</div>
            <h1 className="text-2xl font-extrabold text-emce-text">Verification link invalid</h1>
            <p className="mt-2 text-emce-text-sec">
              This link has expired or has already been used. Sign in and request a new one from your dashboard.
            </p>
            <Button asChild className="mt-6">
              <Link href="/signin">Sign in</Link>
            </Button>
          </>
        )}
      </Card>
    </main>
  );
}
