import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "EV AI Tools — interview prep, resume scoring & more",
  description:
    "Free EV-industry AI tools: mock interviews, company-specific interview simulator, resume scoring, and more. Built for candidates targeting battery, charging, motor, and EV software roles.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/ai-tools` },
};

/**
 * Hub page listing every AI tool the platform exposes — discovery
 * surface that the homepage CTA + footer link both point at. Each
 * tool gets a card with a one-line pitch, the "Free" / "Pro" tag,
 * and a deep link to start. Sorted by user value, not alphabetical.
 *
 * Adding a new tool? Append to TOOLS below and the rest of the
 * routing surfaces (footer, /ai-tools/<route>) follow.
 */

interface Tool {
  href: string;
  emoji: string;
  title: string;
  blurb: string;
  badge?: { label: string; tone: "free" | "pro" | "new" };
  status: "live" | "soon";
}

const TOOLS: Tool[] = [
  {
    href: "/ai-tools/interview-prep",
    emoji: "📚",
    title: "Interview Prep",
    blurb:
      "AI study plan for your upcoming round — 5-7 topic cards with sample questions, answer outlines, and where to deepen knowledge. Cram-note tuned to how many days you have.",
    badge: { label: "New · Free", tone: "new" },
    status: "live",
  },
  {
    href: "/ai-tools/mock-interview",
    emoji: "🎤",
    title: "Embedded Mock Interview",
    blurb:
      "Practice an EV-industry interview with an AI that adapts difficulty to your answers. Scored breakdown + actionable feedback when you wrap up.",
    badge: { label: "New · Free", tone: "new" },
    status: "live",
  },
  {
    href: "/ai-tools/interview-simulator",
    emoji: "🏭",
    title: "EV Interview Simulator",
    blurb:
      "Role-play an interview at a specific company (Ola, Tata, Ather, Bosch…) with the interviewer style they actually use. Walks the same script their real hiring loops do.",
    badge: { label: "New · Free", tone: "new" },
    status: "live",
  },
  {
    href: "/ai-tools/skills-analyzer",
    emoji: "🧭",
    title: "Analyze Your EV Skills",
    blurb:
      "Paste your skills, we score you across battery / charging / motors / software / industry context. Returns 3-5 prioritised gaps + the strengths to bring forward on your resume.",
    badge: { label: "New · Free", tone: "new" },
    status: "live",
  },
  {
    href: "/ai-tools/internship-navigator",
    emoji: "🎯",
    title: "Internship Hunt Navigator",
    blurb:
      "We re-rank our live EV internship postings against your skills + goals, flag the 5 strongest matches, and tell you what to learn before applying.",
    badge: { label: "New · Free", tone: "new" },
    status: "live",
  },
  {
    href: "/roast",
    emoji: "🔥",
    title: "Roast My Resume",
    blurb:
      "Drop your PDF/DOCX and we score it against the EV-industry rubric — battery / charging / motors / software / format. 0-100 with prioritised fixes.",
    badge: { label: "Free", tone: "free" },
    status: "live",
  },
  {
    href: "/salaries",
    emoji: "💰",
    title: "Salary Compass",
    blurb:
      "Verified salary submissions across EV companies + roles. Submit one anonymously to unlock the full database.",
    badge: { label: "Free", tone: "free" },
    status: "live",
  },
];

const BADGE_TONE: Record<NonNullable<Tool["badge"]>["tone"], string> = {
  free: "bg-emce-light-soft text-emce-darkest",
  pro: "bg-emce-orange-light text-emce-orange-deep",
  new: "bg-emce-mid text-emce-darkest",
};

export default function AIToolsHub() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <section className="emce-hero-gradient text-white">
          <div className="container max-w-4xl py-12 md:py-16">
            <p className="text-hint font-bold uppercase tracking-wide text-emce-mid">
              AI tools, built for the EV industry
            </p>
            <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-4xl">
              Get the unfair edge on your next EV interview
            </h1>
            <p className="mt-3 max-w-2xl text-white/85">
              Free, no-signup tools designed for India&apos;s EV hiring loops.
              Every tool is tuned to the battery / charging / motors / software
              hiring bar — not the generic SaaS one.
            </p>
          </div>
        </section>

        <div className="container max-w-4xl py-8 md:py-10">
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group block"
              >
                <Card className="h-full p-5 transition hover:border-emce-mid hover:shadow-emce-hover">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-3xl">{t.emoji}</div>
                    {t.badge && (
                      <Badge className={`text-[10px] ${BADGE_TONE[t.badge.tone]}`}>
                        {t.badge.label}
                      </Badge>
                    )}
                  </div>
                  <h2 className="mt-2 text-section text-emce-text group-hover:underline">
                    {t.title}
                  </h2>
                  <p className="mt-1 text-body text-emce-text-sec">{t.blurb}</p>
                  <p className="mt-3 text-hint font-bold text-emce-dark">
                    Open →
                  </p>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="mt-6 bg-emce-light-soft">
            <h3 className="text-section text-emce-text">More AI tools coming</h3>
            <p className="mt-2 text-body text-emce-text-sec">
              EV Cover Letter Generator · Career Path Advisor · LinkedIn Profile
              Optimizer · ATS Resume Creator · Skills Gap Analysis. We&apos;re
              shipping one per week. Want one prioritised?{" "}
              <Link href="/contact" className="font-bold text-emce-dark underline">
                Tell us.
              </Link>
            </p>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
