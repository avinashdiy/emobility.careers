import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopicPicker } from "@/components/social/TopicPicker";

export const metadata = { title: "Pick a few topics" };

/**
 * Final onboarding step. Optional, low-pressure — the user has
 * already done the four hard steps (mode → resume → confirm →
 * preferences) and we don't want them to bail this close to /me.
 *
 * Suggestions are derived from the candidate's EV domains (the
 * skills under those domains share the hashtag namespace by
 * convention — `battery-engineering`, `bms`, etc.). When the
 * candidate has no domains yet (e.g. they skipped that section
 * during the confirm step), we fall back to a curated platform-
 * wide starter set so the page never lands empty.
 */
const FALLBACK_TOPICS = [
  "battery-engineering",
  "bms",
  "charging-infrastructure",
  "lfp",
  "electric-mobility",
  "evindia",
  "thermal-management",
  "motor-design",
  "fleet-electrification",
  "two-wheelers",
  "hydrogen-fuel-cell",
  "policy",
] as const;

export default async function OnboardingTopicsStep() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/onboarding/topics");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/onboarding");

  // Pull skill slugs from the user's EV domains (up to 4 domains × 6
  // skills) and merge with the fallback list. We dedupe so a domain-
  // matched suggestion doesn't double up with the curated starter set.
  const myDomains = await db.candidateEVDomain.findMany({
    where: { candidateId: profile.id },
    select: {
      evDomain: {
        select: {
          name: true,
          skills: { select: { slug: true }, take: 6, orderBy: { name: "asc" } },
        },
      },
    },
    take: 4,
  });
  const domainSuggestions = myDomains.flatMap((d) => d.evDomain.skills.map((s) => s.slug));

  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const t of [...domainSuggestions, ...FALLBACK_TOPICS]) {
    if (seen.has(t)) continue;
    seen.add(t);
    suggestions.push(t);
    if (suggestions.length >= 18) break;
  }

  return (
    <Card className="p-8">
      <Badge variant="default" className="mb-2">Step 5 of 5 · Optional</Badge>
      <h1 className="text-2xl font-extrabold text-emce-text">
        What do you want to read about?
      </h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Pick a few topics — your <strong>For-you feed</strong> will fill up with posts
        tagged with them. You can change this anytime from{" "}
        <Link href="/me/topics" className="font-bold text-emce-dark hover:underline">
          /me/topics
        </Link>
        .
      </p>

      <div className="mt-6">
        <TopicPicker suggestions={suggestions} />
      </div>
    </Card>
  );
}
