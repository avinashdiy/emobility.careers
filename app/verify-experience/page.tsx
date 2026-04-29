import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { confirmExperienceEmailVerify } from "@/server/experience-verify/actions";

export const metadata = { title: "Verify your role" };

/**
 * Token-consume page for the "Verify Company" email-OTP flow. The link
 * the candidate clicks from their inbox lands here with `?token=...`.
 * We consume the token, stamp the experience, and render a success or
 * failure card.
 *
 * No auth required — the click itself is the proof. The token is
 * single-use and 24h-expiring.
 */
export default async function VerifyExperiencePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const result = sp.token ? await confirmExperienceEmailVerify(sp.token) : { ok: false };

  return (
    <>
      <SiteHeader />
      <main className="container max-w-xl py-16">
        <Card>
          {result.ok ? (
            <>
              <div className="text-5xl">✅</div>
              <h1 className="mt-3 text-2xl font-extrabold text-emce-text">
                You're verified at {result.companyName ?? "your company"}.
              </h1>
              <p className="mt-2 text-emce-text-sec">
                A green <strong>✓ Verified</strong> badge will now show next to your role on your public profile.
                Recruiters trust this badge — it doubles your inbound rate, on average.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/me/profile">View my profile</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/jobs">Browse EV jobs</Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="text-5xl">⏳</div>
              <h1 className="mt-3 text-2xl font-extrabold text-emce-text">
                This link is invalid or expired.
              </h1>
              <p className="mt-2 text-emce-text-sec">
                Verification links expire 24 hours after they're sent and only work once. Request a new one from your profile editor.
              </p>
              <Button asChild className="mt-5">
                <Link href="/me/profile">Open profile editor →</Link>
              </Button>
            </>
          )}
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
