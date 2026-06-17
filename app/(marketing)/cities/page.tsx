import Link from "next/link";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { listCities } from "@/lib/jobs/cities";

/**
 * /cities — browse hub for every city with open EV jobs. Pure SEO
 * scaffold: a single crawlable page that links to all the /jobs/[city]
 * facet pages (pune, bengaluru, …), so the long-tail city pages get
 * discovered + internal-link equity. Targets "EV jobs by city" and
 * funnels to each city's high-intent listing.
 *
 * Revalidate hourly — cities + counts shift as jobs open/close.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "EV jobs by city — Pune, Bengaluru, Delhi, Chennai & more",
  description:
    "Browse electric-vehicle jobs city by city across India. Open battery, charging, motor, vehicle-engineering and software roles in every EV hub, updated daily on eMobility Careers.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/cities` },
};

export default async function CitiesHubPage() {
  const cities = await listCities();

  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        EV jobs by city
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
        Find electric-vehicle roles in your city. Pick a hub to see open
        jobs locally, or browse the{" "}
        <Link href="/jobs" className="font-bold text-emce-dark hover:underline">
          full job board
        </Link>
        .
      </p>

      {cities.length === 0 ? (
        <p className="mt-8 text-sm text-emce-text-sec">
          No open roles with a listed city right now — browse{" "}
          <Link href="/jobs" className="font-bold text-emce-dark hover:underline">
            all EV jobs
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => (
            <Link key={c.slug} href={`/jobs/${c.slug}`} className="block">
              <Card className="flex h-full items-center justify-between gap-2 p-4 transition hover:border-emce-mid hover:shadow-emce-hover">
                <span className="font-bold text-emce-text">{c.name}</span>
                <span className="shrink-0 rounded-full bg-emce-light-soft px-2.5 py-0.5 text-xs font-extrabold text-emce-dark">
                  {c.count}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
