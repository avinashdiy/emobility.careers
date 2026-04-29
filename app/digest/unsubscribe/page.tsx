import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { unsubscribeFromDigest } from "@/server/whatsapp-digest/actions";

export const metadata = { title: "Unsubscribe from EV Jobs Daily" };

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const sp = await searchParams;
  const result = sp.t ? await unsubscribeFromDigest(sp.t) : { ok: false };

  return (
    <>
      <SiteHeader />
      <main className="container max-w-xl py-16">
        <Card>
          {result.ok ? (
            <>
              <div className="text-5xl">✅</div>
              <h1 className="mt-3 text-2xl font-extrabold text-emce-text">
                Unsubscribed.
              </h1>
              <p className="mt-2 text-emce-text-sec">
                You won't receive any more daily digest messages. If you change your mind, you can re-subscribe in 30 seconds.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/digest">Re-subscribe</Link>
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
                This unsubscribe link is invalid.
              </h1>
              <p className="mt-2 text-emce-text-sec">
                The link may have been mistyped. Use the button at the bottom of any digest message to unsubscribe.
              </p>
            </>
          )}
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
