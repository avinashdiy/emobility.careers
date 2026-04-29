import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { subscribeToDigest } from "@/server/whatsapp-digest/actions";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV Jobs Daily on WhatsApp — 5 fresh EV jobs every morning",
  description:
    "Subscribe free to a daily WhatsApp digest of fresh EV jobs in India. Filter by domain, location, and career stage. Unsubscribe with one tap.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/digest` },
};

/**
 * Public digest subscription page. Anonymous-friendly: anyone with a
 * phone number can subscribe; signing in makes the subscription
 * findable from /me/preferences but isn't required.
 */
export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const evDomains = await db.eVDomain.findMany({
    orderBy: { order: "asc" },
    select: { slug: true, name: true },
  });
  const subscribed = sp.ok === "1";

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-3xl py-14 md:py-20">
            <div className="emce-pill mb-4">
              <span aria-hidden>📱</span>
              <span>Free · WhatsApp · Unsubscribe in one tap</span>
            </div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight md:text-5xl">
              5 fresh EV jobs<br />
              <span className="text-emce-mid">every morning. On WhatsApp.</span>
            </h1>
            <p className="mt-4 max-w-xl text-white/85 md:text-lg">
              India runs on WhatsApp. Skip the inbox — get curated EV jobs delivered to the app you already check 100 times a day. Filter by domain and location.
            </p>
          </div>
        </section>

        <div className="container max-w-2xl space-y-6 py-10">
          {subscribed ? (
            <Card className="border-emce-mid bg-emce-light-soft">
              <p className="text-section text-emce-text">
                ✅ You're subscribed.
              </p>
              <p className="mt-1 text-hint text-emce-text-sec">
                Watch your WhatsApp tomorrow morning (around 9am IST). The first message you get includes an unsubscribe link.
              </p>
            </Card>
          ) : sp.error ? (
            <div className="rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red">
              ⚠️ {sp.error}
            </div>
          ) : null}

          <Card>
            <form action={subscribeToDigest} className="space-y-4">
              {/* Honeypot */}
              <div aria-hidden className="sr-only" style={{ position: "absolute", left: "-10000px" }}>
                <label>
                  Website (leave blank)
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>
              </div>

              <div>
                <Label htmlFor="phone">WhatsApp number *</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  placeholder="98765 43210"
                  inputMode="tel"
                />
                <p className="mt-1 text-hint text-emce-text-muted">
                  India numbers default to +91. Other country codes accepted with a leading +.
                </p>
              </div>

              <div>
                <Label htmlFor="profileMode">Career stage</Label>
                <NativeSelect id="profileMode" name="profileMode" defaultValue="">
                  <option value="">Any career stage</option>
                  <option value="FRESHER">Fresher (0-1 yrs)</option>
                  <option value="EXPERIENCED">Experienced</option>
                  <option value="LEADERSHIP">Leadership</option>
                  <option value="TECHNICIAN">Technician</option>
                </NativeSelect>
              </div>

              <div>
                <Label htmlFor="location">Preferred location (optional)</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="e.g. Bengaluru"
                  maxLength={80}
                />
              </div>

              <div>
                <Label>EV domains (optional — leave all unchecked for everything)</Label>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {evDomains.map((d) => (
                    <label
                      key={d.slug}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-emce-border bg-white px-2.5 py-1.5 text-sm hover:bg-emce-light-soft"
                    >
                      <input
                        type="checkbox"
                        name="evDomainSlugs"
                        value={d.slug}
                        className="h-4 w-4 accent-emce-mid"
                      />
                      <span>{d.name}</span>
                    </label>
                  ))}
                </div>
                {/* HTML form-data flattens checkboxes with the same name into
                    multiple values; the action joins them. We pass them as a
                    single comma-separated string by hand here so the
                    server-side schema stays simple — done via a hidden
                    field in the script-less version is overkill, so we
                    accept the multi-value form below by joining via JS-less
                    "name=evDomainSlugs" and a small server-side split. */}
              </div>

              <Button type="submit" size="lg" className="w-full">
                📱 Subscribe — get tomorrow's digest
              </Button>
              <p className="text-center text-hint text-emce-text-muted">
                We send one digest per day. Every message includes an unsubscribe link. We never share your number.
              </p>
            </form>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <SmallCard emoji="🌅" title="9am IST" body="Once daily, never spammy. We skip days with no fresh jobs." />
            <SmallCard emoji="🎯" title="Filtered" body="EV domains + location + career stage. We only send jobs that fit." />
            <SmallCard emoji="↩️" title="Unsubscribe in one tap" body="Every message has a button. No hoops, no support emails." />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function SmallCard({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <Card className="text-center">
      <div className="text-2xl" aria-hidden>{emoji}</div>
      <p className="mt-1 font-bold text-emce-text">{title}</p>
      <p className="mt-1 text-hint text-emce-text-sec">{body}</p>
    </Card>
  );
}
