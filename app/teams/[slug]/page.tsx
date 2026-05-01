import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { ShareDropdown } from "@/components/social/ShareDropdown";
import { env } from "@/lib/env";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Public team page — the viral artefact.
 *
 * Visible only when the team has `publicPageStatus = PUBLISHED`. We
 * still render via 404 for HIDDEN / DRAFT to avoid leaking the
 * existence of half-built teams. Owner / admin viewers see a hint
 * banner instead of a 404 so they know where to go.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await db.competitionRegistration.findUnique({
    where: { teamSlug: slug },
    include: { competition: { select: { title: true } } },
  });
  if (!team || team.publicPageStatus !== "PUBLISHED") {
    return { title: "Team not found", robots: { index: false, follow: false } };
  }
  const title = `${team.teamName} · ${team.externalEvent ?? team.competition.title}`;
  const description = team.teamBio
    ? team.teamBio.slice(0, 200)
    : `${team.teamName} is competing in ${team.competition.title} on eMobility Careers.`;
  return {
    title,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/teams/${slug}` },
    openGraph: {
      type: "website",
      url: `${env.NEXT_PUBLIC_APP_URL}/teams/${slug}`,
      title,
      description,
      siteName: "eMobility Careers",
    },
  };
}

export default async function PublicTeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const team = await db.competitionRegistration.findUnique({
    where: { teamSlug: slug },
    include: {
      competition: {
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          totalPrizePoolMinor: true,
          prizeCurrency: true,
        },
      },
      institutionRef: {
        select: { id: true, name: true, slug: true, logoUrl: true, city: true },
      },
      leader: {
        select: {
          name: true,
          candidateProfile: {
            select: { slug: true, profilePhotoUrl: true, headline: true },
          },
        },
      },
      members: {
        where: { status: "ACCEPTED" },
        orderBy: [{ role: "asc" }, { acceptedAt: "asc" }],
        include: {
          user: {
            select: {
              name: true,
              candidateProfile: {
                select: { slug: true, profilePhotoUrl: true, headline: true },
              },
            },
          },
        },
      },
      submissions: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        include: { stage: { select: { kind: true, name: true } } },
      },
    },
  });

  if (!team) notFound();

  // Owner / admin can see the page even when not published, so they
  // can preview before flipping the switch. Anyone else gets 404 for
  // DRAFT / HIDDEN.
  const isOwner = session?.user?.id === team.leaderUserId;
  const isAdmin = session?.user?.role === "ADMIN";
  const previewMode =
    team.publicPageStatus !== "PUBLISHED" && (isOwner || isAdmin);
  if (team.publicPageStatus !== "PUBLISHED" && !previewMode) {
    notFound();
  }

  const social =
    team.socialLinks && typeof team.socialLinks === "object" && !Array.isArray(team.socialLinks)
      ? (team.socialLinks as {
          instagram?: string;
          linkedin?: string;
          website?: string;
          youtube?: string;
        })
      : {};
  const submission = team.submissions[0] ?? null;

  // Final placement — populated by `announceResults` when the
  // competition closes.
  const placement = team.finalRank
    ? team.finalRank === 1
      ? "🏆 1st Place"
      : team.finalRank === 2
        ? "🥈 2nd Place"
        : team.finalRank === 3
          ? "🥉 3rd Place"
          : `Finalist · #${team.finalRank}`
    : null;

  return (
    <>
      <SiteHeader />
      <main className="container max-w-4xl space-y-6 py-8">
        {previewMode && (
          <Card className="border-emce-orange/40 bg-emce-orange-light/30 p-3 text-sm">
            <strong>Preview only.</strong> This team page is{" "}
            {team.publicPageStatus.toLowerCase()} — the public can&apos;t see it.{" "}
            <Link href={`/me/teams/${team.id}`} className="font-bold text-emce-dark underline">
              Open dashboard →
            </Link>
          </Card>
        )}

        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Avatar src={team.teamLogoUrl} name={team.teamName ?? "T"} size="xl" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h1 className="text-2xl font-extrabold text-emce-text md:text-3xl">
                  {team.teamName}
                </h1>
                {team.verificationStatus === "VERIFIED" && (
                  <Badge variant="success" size="sm">✓ Verified team</Badge>
                )}
                {placement && <Badge variant="success">{placement}</Badge>}
              </div>
              <p className="mt-1 text-emce-text-sec">
                Competing in{" "}
                <Link
                  href={`/competitions/${team.competition.slug}`}
                  className="font-bold text-emce-dark hover:underline"
                >
                  {team.competition.title}
                </Link>
                {team.externalEvent && <> · {team.externalEvent}</>}
                {team.externalTeamId && <> · #{team.externalTeamId}</>}
              </p>
              {/* Prefer the canonical institution name when the team
                  is linked to an Institution row — gives us a clickable
                  link for visitors to discover other teams at the same
                  college. Fall back to free text otherwise. */}
              {team.institutionRef ? (
                <p className="mt-1 text-hint text-emce-text-sec">
                  📍{" "}
                  <Link
                    href={`/institutions/${team.institutionRef.slug}`}
                    className="font-bold text-emce-dark hover:underline"
                  >
                    {team.institutionRef.name}
                  </Link>
                  {team.institutionRef.city && <> · {team.institutionRef.city}</>}
                </p>
              ) : team.institution ? (
                <p className="mt-1 text-hint text-emce-text-sec">📍 {team.institution}</p>
              ) : null}
              {team.facultyAdvisor && (
                <p className="text-hint text-emce-text-muted">
                  Faculty advisor: {team.facultyAdvisor}
                </p>
              )}

              {team.teamBio && (
                <p className="mt-3 whitespace-pre-line text-body text-emce-text-sec">
                  {team.teamBio}
                </p>
              )}

              {/* Social links — render only the keys the captain set */}
              {(social.website || social.instagram || social.linkedin || social.youtube) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {social.website && (
                    <SocialChip href={social.website} label="Website" />
                  )}
                  {social.instagram && (
                    <SocialChip href={social.instagram} label="Instagram" />
                  )}
                  {social.linkedin && (
                    <SocialChip href={social.linkedin} label="LinkedIn" />
                  )}
                  {social.youtube && (
                    <SocialChip href={social.youtube} label="YouTube" />
                  )}
                </div>
              )}

              <div className="mt-4 border-t border-emce-border pt-3">
                <ShareDropdown
                  url={`${env.NEXT_PUBLIC_APP_URL}/teams/${team.teamSlug}`}
                  title={`${team.teamName} on eMobility Careers`}
                  description={`Watch ${team.teamName} compete in ${team.competition.title}.`}
                  label="Share team page"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Prototype video — first-class field. Render an inline
            iframe when the URL is YouTube, otherwise a button-style
            link. */}
        {submission?.prototypeVideoUrl && (
          <Card className="p-5">
            <h2 className="text-section text-emce-text">Prototype</h2>
            <div className="mt-3">
              <PrototypeEmbed url={submission.prototypeVideoUrl} />
            </div>
            {submission.summary && (
              <p className="mt-3 text-body text-emce-text-sec">{submission.summary}</p>
            )}
          </Card>
        )}

        {/* Members */}
        <Card className="p-5">
          <h2 className="text-section text-emce-text">Members ({team.members.length})</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {team.members.map((m) => {
              const cp = m.user?.candidateProfile;
              const name = m.user?.name ?? "Member";
              return (
                <li key={m.id}>
                  {cp?.slug ? (
                    <Link
                      href={`/${cp.slug}`}
                      className="flex items-center gap-3 rounded-md border border-emce-border bg-white p-3 hover:border-emce-mid hover:shadow-emce-hover"
                    >
                      <Avatar src={cp.profilePhotoUrl} name={name} size="sm" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-bold text-emce-text">{name}</span>
                          {m.role === "LEADER" && (
                            <Badge variant="success" size="sm">Captain</Badge>
                          )}
                        </div>
                        {m.positionTitle && (
                          <p className="text-hint text-emce-text-sec">{m.positionTitle}</p>
                        )}
                        {!m.positionTitle && cp?.headline && (
                          <p className="text-hint text-emce-text-sec line-clamp-1">{cp.headline}</p>
                        )}
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-md border border-emce-border bg-white p-3">
                      <Avatar src={null} name={name} size="sm" />
                      <div className="min-w-0">
                        <span className="font-bold text-emce-text">{name}</span>
                        {m.positionTitle && (
                          <p className="text-hint text-emce-text-sec">{m.positionTitle}</p>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Activity / footer */}
        <Card className="p-4">
          <p className="text-hint text-emce-text-muted">
            Team page published {team.publishedAt ? relativeTime(team.publishedAt) : "—"}.
            Registration {relativeTime(team.registeredAt)}.
          </p>
          <div className="mt-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/competitions/${team.competition.slug}`}>
                View competition →
              </Link>
            </Button>
          </div>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}

function SocialChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-1 rounded-full border border-emce-border bg-white px-3 py-1 text-hint font-bold text-emce-dark hover:border-emce-mid hover:bg-emce-light-soft"
    >
      {label} →
    </a>
  );
}

/**
 * Prototype-video renderer. Best-effort YouTube/Vimeo embed; falls
 * back to a "Watch video" link for everything else (MinIO uploads,
 * Drive, Dropbox). We intentionally don't try to detect every
 * provider — a clear "open in new tab" link is honest UX when the
 * URL isn't an embeddable platform we know.
 */
function PrototypeEmbed({ url }: { url: string }) {
  const youtube = parseYouTubeId(url);
  if (youtube) {
    return (
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${youtube}`}
          title="Prototype video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  const vimeoId = parseVimeoId(url);
  if (vimeoId) {
    return (
      <div className="aspect-video overflow-hidden rounded-md bg-black">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          title="Prototype video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex items-center gap-2 rounded-md border border-emce-border bg-white px-4 py-3 text-sm font-bold text-emce-dark hover:bg-emce-light-soft"
    >
      ▶ Watch prototype video →
    </a>
  );
}

function parseYouTubeId(url: string): string | null {
  // Match youtube.com/watch?v=ID and youtu.be/ID and /shorts/ID.
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

function parseVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}
