import Link from "next/link";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { CAREER_GUIDES } from "@/lib/career-guides/guides";

/**
 * /career-guides — index of EV career guides. Captures high-intent
 * informational search ("how to become an EV engineer", "EV careers
 * guide") and internally links every /career-guides/[slug] depth page.
 */
export const metadata: Metadata = {
  title: "EV Career Guides — how to become a battery, charging, powertrain or software engineer",
  description:
    "Step-by-step career guides for India's EV industry: skills, qualifications, salary and roadmaps for battery, BMS, charging, powertrain, embedded software and service-technician roles.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/career-guides` },
};

export default function CareerGuidesIndexPage() {
  return (
    <div className="container max-w-4xl py-8 md:py-12">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text md:text-3xl">
        EV career guides
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-emce-text-sec md:text-base">
        Practical, India-specific roadmaps into the electric-mobility industry — the skills,
        qualifications, salaries and steps for each role. Pick a career to get started, or browse the{" "}
        <Link href="/jobs" className="font-bold text-emce-dark hover:underline">live job board</Link>.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {CAREER_GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/career-guides/${g.slug}`} className="block">
              <Card className="h-full p-5 transition hover:border-emce-mid hover:shadow-emce-hover">
                <h2 className="text-section text-emce-text">How to become a {g.role}</h2>
                <p className="mt-2 text-sm text-emce-text-sec">{g.tagline}.</p>
                <span className="mt-3 inline-block text-sm font-bold text-emce-dark">
                  Read the guide →
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
