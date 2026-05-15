import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata = {
  title: "DIYguru-verified candidates",
  description:
    "DIYguru-trained EV technicians and engineers carry a verified badge on eMobility Careers — proof of hands-on lab exposure, capstone projects, and certified curriculum.",
};

const HOW = [
  {
    step: 1,
    title: "Train at DIYguru",
    body: "Complete a DIYguru certification programme — Battery, Charging, Motor Control, Vehicle Engineering, or one of our specialised tracks.",
  },
  {
    step: 2,
    title: "Roster sync",
    body: "DIYguru sends your cohort details to eMobility Careers. Your email, certificate ID, lab tags, and capstone project are loaded into the platform.",
  },
  {
    step: 3,
    title: "Sign up & auto-verify",
    body: "When you create your candidate profile with the same email, our system matches you against the roster and applies the ⭐ Verified badge automatically.",
  },
  {
    step: 4,
    title: "Stand out to employers",
    body: "Recruiters see your verified badge, lab exposure tags, and capstone projects directly on your profile. Many employers filter for DIYguru-verified candidates first.",
  },
];

const PERKS = [
  "⭐ Verified badge on your public profile",
  "🔬 Lab exposure tags surfaced to recruiters",
  "📂 Capstone project linked to your profile",
  "🎯 +10% boost in AI matching score",
  "🔍 Filterable by recruiters as 'DIYguru-only'",
];

export default function DIYguruPage() {
  return (
    <>
      <SiteHeader />
      <section className="emce-hero-gradient pb-16 pt-16 text-white">
        <div className="container max-w-4xl">
          <div className="emce-pill mb-4">⭐ Verified</div>
          <h1 className="text-hero text-white">
            Trained at <span className="text-emce-mid">DIYguru?</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/85 md:text-lg">
            DIYguru graduates carry a verified badge on eMobility Careers — the strongest signal
            of hands-on EV training in India. Here&apos;s how verification works.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup?role=CANDIDATE">Create your profile →</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white text-white hover:bg-white/10 hover:text-white">
              <a href="https://diyguru.org" target="_blank" rel="noopener noreferrer">Visit DIYguru</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="container max-w-4xl py-12">
        <Badge variant="default" className="mb-2">How verification works</Badge>
        <h2 className="text-dashboard text-emce-text md:text-3xl">Four steps to verified</h2>
        <ol className="mt-6 space-y-4">
          {HOW.map((s) => (
            <li key={s.step}>
              <Card className="p-5">
                <div className="flex items-start gap-4">
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-emce-light-soft text-base font-extrabold text-emce-dark">
                    {s.step}
                  </div>
                  <div>
                    <h3 className="font-bold text-emce-text">{s.title}</h3>
                    <p className="mt-1 text-body text-emce-text-sec">{s.body}</p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>

        <Card className="mt-10 border-emce-mid bg-emce-light-soft p-6">
          <h2 className="text-section text-emce-text">What you get as a verified candidate</h2>
          <ul className="mt-3 space-y-2">
            {PERKS.map((p) => (
              <li key={p} className="text-body text-emce-text-sec">{p}</li>
            ))}
          </ul>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">My verification didn&apos;t apply automatically — what now?</h2>
          <p className="mt-2 text-body text-emce-text-sec">
            Sometimes the email you used at DIYguru differs from the one you sign up with here. Email{" "}
            <a href="mailto:verify@emobility.careers" className="font-bold text-emce-dark hover:underline">
              verify@emobility.careers
            </a>{" "}
            with your DIYguru certificate ID and we&apos;ll reconcile it within 24 hours.
          </p>
        </Card>
      </div>
      <SiteFooter />
    </>
  );
}
