import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SkillCompassCard } from "@/components/profile/SkillCompassCard";
import { computeCompass } from "@/lib/skill-compass";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";
import { env } from "@/lib/env";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  if (RESERVED_SLUGS.has(username.toLowerCase())) {
    return { title: "EV Skill Compass", robots: { index: false, follow: false } };
  }
  const profile = await db.candidateProfile.findUnique({
    where: { slug: username },
    select: {
      firstName: true,
      lastName: true,
      headline: true,
      cvVisibility: true,
    },
  });
  if (!profile || profile.cvVisibility !== "EVERYONE") {
    return { title: "EV Skill Compass", robots: { index: false, follow: false } };
  }
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  return {
    title: `${name}'s EV Skill Compass`,
    description:
      profile.headline ??
      `${name}'s verified EV-domain skill profile on emobility.careers — Battery, Charging, Powertrain, Motors, Vehicle, Software.`,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/${username}/compass` },
  };
}

/**
 * Public Skill Compass page. The viral surface for an individual
 * candidate — a beautiful Pokémon-style stat card designed to be
 * screenshotted and posted to LinkedIn / X / WhatsApp.
 *
 * Routing rules:
 *   - Public profile (cvVisibility=EVERYONE) → renders the full card +
 *     share buttons + signup CTA for visitors.
 *   - Non-public profile → 404, never leak.
 *   - Owner viewing own compass → still renders publicly but adds a
 *     "Privacy" tip if visibility is gated.
 *
 * The page intentionally has heavy share affordances. Every share is
 * a billboard for the platform: every URL contains the candidate's
 * slug, and every screenshot of the card carries the
 * `emobility.careers/<slug>/compass` watermark.
 */
export default async function CompassPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (RESERVED_SLUGS.has(username.toLowerCase())) notFound();

  const profile = await db.candidateProfile.findUnique({
    where: { slug: username },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      isDIYguruVerified: true,
      cvVisibility: true,
      userId: true,
    },
  });
  if (!profile) notFound();

  const session = await auth();
  const isOwner = session?.user?.id === profile.userId;
  // Public profiles are visible to everyone; otherwise only the owner /
  // admin can see their own compass. We never reveal a private profile
  // to a public URL — that's the same rule the main profile route uses.
  const allowed =
    profile.cvVisibility === "EVERYONE" ||
    isOwner ||
    session?.user?.role === "ADMIN";
  if (!allowed) notFound();

  const result = await computeCompass(profile.id);
  if (!result) notFound();

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const shareUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${profile.slug}/compass`;
  const shareText = `My EV Skill Compass on emobility.careers · ${result.overall.toFixed(
    1,
  )}/10 (${result.archetype})`;

  const linkedinShare = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const xShare = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-emce-light-bg">
        <div className="container max-w-5xl py-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Link
                href={`/${profile.slug}`}
                className="text-hint font-bold text-emce-dark hover:underline"
              >
                ← {isOwner ? "Back to my profile" : `Back to ${profile.firstName}'s profile`}
              </Link>
              <h1 className="mt-1 text-2xl font-extrabold text-emce-text md:text-[28px]">
                {isOwner ? "Your" : `${fullName}'s`} EV Skill Compass
              </h1>
              <p className="mt-1 text-sm text-emce-text-sec">
                Verified across six EV domains · top-3 average drives the overall score.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
            {/* Card itself — scales on smaller viewports via the responsive
                wrapper. The card sets a fixed pixel size for screenshot
                fidelity; the wrapper allows it to overflow on phones. */}
            <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible">
              <SkillCompassCard
                result={result}
                candidate={{
                  name: fullName,
                  headline: profile.headline,
                  avatarUrl: profile.profilePhotoUrl,
                  slug: profile.slug,
                  isDIYguruVerified: profile.isDIYguruVerified,
                }}
              />
            </div>

            {/* Right rail — share + breakdown + CTA */}
            <div className="space-y-4">
              <Card>
                <h2 className="text-section text-emce-text">Share your Compass</h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Post the card below on LinkedIn, X, or WhatsApp. The link
                  unfurls as the same card image for everyone you share with.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <a
                    href={linkedinShare}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-[#0a66c2] px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
                  >
                    LinkedIn
                  </a>
                  <a
                    href={xShare}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-black px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
                  >
                    X
                  </a>
                  <a
                    href={whatsappShare}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-[#25D366] px-3 py-2 text-center text-sm font-bold text-white hover:opacity-90"
                  >
                    WhatsApp
                  </a>
                </div>
                <CopyLink url={shareUrl} />
              </Card>

              {/* Per-domain evidence breakdown — nerdy detail for those who
                  want to know why their levels are what they are. */}
              <Card>
                <h2 className="text-section text-emce-text">Evidence breakdown</h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Levels are derived from skills, certifications, projects, direct domain assignment, and years of experience. Add more verifiable signals on your profile to raise a domain.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {result.domains.map((d) => (
                    <li key={d.slug} className="flex items-start justify-between gap-2 border-t border-emce-border pt-2 first:border-0 first:pt-0">
                      <div>
                        <p className="font-bold text-emce-text">
                          {d.emoji} {d.name}{" "}
                          <span className="ml-1 text-emce-text-sec">{d.raw.toFixed(1)}/10</span>
                        </p>
                        <p className="text-hint text-emce-text-sec">
                          {d.evidence.direct ? "✓ declared · " : ""}
                          {d.evidence.skills > 0 && `${d.evidence.skills} skill${d.evidence.skills === 1 ? "" : "s"} · `}
                          {d.evidence.projects > 0 && `${d.evidence.projects} project${d.evidence.projects === 1 ? "" : "s"} · `}
                          {d.evidence.certifications > 0 && `${d.evidence.certifications} cert${d.evidence.certifications === 1 ? "" : "s"}${d.evidence.diyguruCerts > 0 ? ` (${d.evidence.diyguruCerts} DIYguru)` : ""} · `}
                          {d.evidence.direct && `${d.evidence.yearsExp} yrs exp`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                {isOwner && (
                  <Button asChild className="mt-4 w-full">
                    <Link href="/me/profile">Edit profile to raise levels →</Link>
                  </Button>
                )}
              </Card>

              {/* Visitor CTA — anonymous + non-owner candidates land here
                  via shares. The pitch: get your own card, free. */}
              {!isOwner && (
                <Card className="bg-emce-light-bg">
                  <p className="text-section text-emce-text">⚡ Want your own Compass?</p>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Build a verified EV profile in 3 minutes and your card is auto-generated. Free, shareable, screenshot-ready.
                  </p>
                  <Button asChild className="mt-3 w-full">
                    <Link href="/signup?role=CANDIDATE&next=/me/profile">Get my Compass →</Link>
                  </Button>
                </Card>
              )}

              {isOwner && profile.cvVisibility !== "EVERYONE" && (
                <Card className="bg-emce-orange-light">
                  <p className="text-sm font-bold text-emce-orange">
                    🔒 Your profile visibility is{" "}
                    {profile.cvVisibility.toLowerCase().replace("_", " ")}.
                  </p>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Only you and admins can see your Compass right now. Make your profile public on{" "}
                    <Link href="/me/profile?tab=privacy" className="font-bold text-emce-dark hover:underline">
                      Privacy settings
                    </Link>{" "}
                    to share the link.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function CopyLink({ url }: { url: string }) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2">
      <code className="flex-1 truncate font-mono text-[12px] text-emce-text">{url}</code>
      {/* No-JS fallback: anchor with copy hint. Browsers that support
          navigator.clipboard get a button via the inline script-less
          progressive enhancement (left for a future client component). */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-emce-dark px-2 py-1 text-xs font-bold text-white hover:bg-emce-darkest"
      >
        Open ↗
      </a>
    </div>
  );
}
