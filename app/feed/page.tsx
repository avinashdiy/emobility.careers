import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PostComposer } from "@/components/social/PostComposer";
import { PostCard, type FeedPostShape } from "@/components/social/PostCard";
import { ConnectButton } from "@/components/social/ConnectButton";
import { getFeed, suggestConnections, getConnectionStatus } from "@/server/social/queries";
import { isFeatureOff, FeatureOffNotice } from "@/components/layout/FeatureGate";

export const metadata = { title: "Feed" };

export default async function FeedPage() {
  if (await isFeatureOff("feature.social_enabled")) return <FeatureOffNotice title="Social feed" />;
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/feed");

  const me = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      connectionsCount: true,
      followersCount: true,
      postsCount: true,
    },
  });
  if (!me) redirect("/onboarding");

  // Companies the user can post on behalf of
  const teamCompanies = await db.employerProfile.findMany({
    where: { userId: session.user.id },
    select: { company: { select: { id: true, name: true, logoUrl: true } } },
  });

  const [posts, suggestions] = await Promise.all([
    getFeed({ viewerId: session.user.id, limit: 20 }),
    suggestConnections(session.user.id, 4),
  ]);

  const fullName = `${me.firstName} ${me.lastName ?? ""}`.trim();

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-6">
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Left rail — profile summary */}
          <aside className="hidden lg:col-span-3 lg:block">
            <Card className="overflow-hidden p-0">
              <div className="emce-hero-gradient h-14" />
              <div className="-mt-7 px-4 pb-4 text-center">
                <Avatar
                  src={me.profilePhotoUrl}
                  name={fullName}
                  size="lg"
                  className="mx-auto ring-4 ring-white"
                />
                <Link
                  href={`/${me.slug}`}
                  className="mt-2 block font-bold text-emce-text hover:underline"
                >
                  {fullName}
                </Link>
                {me.headline && (
                  <p className="mt-1 text-hint text-emce-text-sec line-clamp-2">{me.headline}</p>
                )}
              </div>
              <div className="border-t border-emce-border px-4 py-2 text-hint">
                <Link href="/me/network" className="flex items-center justify-between py-1 text-emce-text-sec hover:bg-emce-light-soft rounded-md px-2">
                  <span>Connections</span>
                  <span className="font-bold text-emce-dark">{me.connectionsCount}</span>
                </Link>
                <Link href={`/${me.slug}`} className="flex items-center justify-between py-1 text-emce-text-sec hover:bg-emce-light-soft rounded-md px-2">
                  <span>Followers</span>
                  <span className="font-bold text-emce-dark">{me.followersCount}</span>
                </Link>
                <Link href={`/${me.slug}`} className="flex items-center justify-between py-1 text-emce-text-sec hover:bg-emce-light-soft rounded-md px-2">
                  <span>Posts</span>
                  <span className="font-bold text-emce-dark">{me.postsCount}</span>
                </Link>
              </div>
            </Card>

            <Card className="mt-3">
              <h2 className="text-section text-emce-text">Quick links</h2>
              <ul className="mt-2 space-y-1 text-hint">
                <li>
                  <Link href="/jobs" className="block rounded-md px-2 py-1.5 hover:bg-emce-light-soft">
                    🔍 Browse EV jobs
                  </Link>
                </li>
                <li>
                  <Link href="/me/applications" className="block rounded-md px-2 py-1.5 hover:bg-emce-light-soft">
                    📨 My applications
                  </Link>
                </li>
                <li>
                  <Link href="/people" className="block rounded-md px-2 py-1.5 hover:bg-emce-light-soft">
                    👥 Discover people
                  </Link>
                </li>
                <li>
                  <Link href="/companies" className="block rounded-md px-2 py-1.5 hover:bg-emce-light-soft">
                    🏢 Discover companies
                  </Link>
                </li>
              </ul>
            </Card>
          </aside>

          {/* Center column — composer + feed */}
          <main className="lg:col-span-6">
            <PostComposer
              user={{
                name: fullName,
                profilePhotoUrl: me.profilePhotoUrl,
                headline: me.headline,
                slug: me.slug,
              }}
              companies={teamCompanies.map((t) => t.company)}
            />

            <div className="mt-4 space-y-3">
              {posts.length === 0 ? (
                <Card className="p-8 text-center">
                  <div className="text-4xl">👋</div>
                  <p className="mt-3 text-section text-emce-text">Your feed is quiet</p>
                  <p className="mt-1 text-hint text-emce-text-sec">
                    Connect with people in the EV industry or follow companies to see updates.
                  </p>
                  <Button asChild className="mt-4">
                    <Link href="/people">Find people →</Link>
                  </Button>
                </Card>
              ) : (
                posts.map((p) => (
                  <PostCard key={p.id} post={p as unknown as FeedPostShape} viewerId={session.user.id} />
                ))
              )}
            </div>
          </main>

          {/* Right rail — suggested connections */}
          <aside className="hidden lg:col-span-3 lg:block">
            <Card>
              <h2 className="text-section text-emce-text">People you may know</h2>
              <p className="mt-1 text-hint text-emce-text-sec">
                Same EV domain as you
              </p>
              {suggestions.length === 0 ? (
                <p className="mt-3 text-hint text-emce-text-muted">
                  We&apos;ll surface suggestions as more people join.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {await Promise.all(
                    suggestions.map(async (s) => {
                      const status = await getConnectionStatus(session.user.id, s.user.id);
                      const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
                      return (
                        <li key={s.id} className="flex items-start gap-2">
                          <Link href={`/${s.slug}`}>
                            <Avatar src={s.profilePhotoUrl} name={fullName} size="sm" />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/${s.slug}`}
                              className="block truncate text-sm font-bold text-emce-text hover:underline"
                            >
                              {fullName}
                            </Link>
                            {s.headline && (
                              <p className="line-clamp-2 text-hint text-emce-text-sec">{s.headline}</p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-1">
                              {s.evDomains.slice(0, 2).map((d) => (
                                <Badge key={d.evDomain.name} variant="outline" className="text-[10px]">
                                  {d.evDomain.name}
                                </Badge>
                              ))}
                            </div>
                            <div className="mt-2">
                              <ConnectButton
                                targetUserId={s.user.id}
                                initialStatus={status.status === "ACCEPTED"
                                  ? "ACCEPTED"
                                  : status.status === "PENDING_OUT" ? "PENDING_OUT"
                                  : status.status === "PENDING_IN" ? "PENDING_IN"
                                  : "NONE"}
                                connectionId={status.connectionId}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    }),
                  )}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
