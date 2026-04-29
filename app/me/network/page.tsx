import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/social/ConnectButton";
import { suggestConnections } from "@/server/social/queries";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Network" };

export default async function NetworkPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/network");

  const [pendingIn, pendingOut, accepted, suggestions] = await Promise.all([
    db.connection.findMany({
      where: { recipientId: session.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        requester: {
          select: {
            id: true,
            candidateProfile: {
              select: {
                slug: true,
                firstName: true,
                lastName: true,
                headline: true,
                profilePhotoUrl: true,
                isDIYguruVerified: true,
                personType: true,
              },
            },
          },
        },
      },
    }),
    db.connection.findMany({
      where: { requesterId: session.user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        recipient: {
          select: {
            id: true,
            candidateProfile: {
              select: {
                slug: true,
                firstName: true,
                lastName: true,
                headline: true,
                profilePhotoUrl: true,
              },
            },
          },
        },
      },
    }),
    db.connection.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: session.user.id }, { recipientId: session.user.id }],
      },
      orderBy: { acceptedAt: "desc" },
      take: 100,
      include: {
        requester: { select: { id: true, candidateProfile: { select: { slug: true, firstName: true, lastName: true, headline: true, profilePhotoUrl: true } } } },
        recipient: { select: { id: true, candidateProfile: { select: { slug: true, firstName: true, lastName: true, headline: true, profilePhotoUrl: true } } } },
      },
    }),
    suggestConnections(session.user.id, 12),
  ]);

  return (
    <div className="container max-w-5xl py-6">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left rail */}
        <aside className="lg:col-span-1">
          <Card>
            <h1 className="text-section text-emce-text">Manage network</h1>
            <ul className="mt-3 space-y-1 text-sm">
              <li className="flex items-center justify-between rounded-md bg-emce-light-soft px-3 py-2 font-bold">
                <span>Connections</span>
                <span className="text-emce-dark">{accepted.length}</span>
              </li>
              <li className="flex items-center justify-between px-3 py-2 text-emce-text-sec">
                <span>Pending received</span>
                <span className="font-bold text-emce-dark">{pendingIn.length}</span>
              </li>
              <li className="flex items-center justify-between px-3 py-2 text-emce-text-sec">
                <span>Pending sent</span>
                <span className="font-bold text-emce-dark">{pendingOut.length}</span>
              </li>
            </ul>
          </Card>
          <Card className="mt-3">
            <h2 className="text-section text-emce-text">Discover</h2>
            <div className="mt-2 space-y-1 text-sm">
              <Button asChild variant="ghost" className="w-full justify-start">
                <Link href="/people">Find people</Link>
              </Button>
              <Button asChild variant="ghost" className="w-full justify-start">
                <Link href="/companies">Discover companies</Link>
              </Button>
            </div>
          </Card>
        </aside>

        {/* Main column */}
        <main className="space-y-4 lg:col-span-2">
          {pendingIn.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Invitations ({pendingIn.length})</h2>
              <ul className="mt-3 divide-y divide-emce-border">
                {pendingIn.map((c) => {
                  const p = c.requester.candidateProfile;
                  if (!p) return null;
                  const fullName = `${p.firstName} ${p.lastName ?? ""}`.trim();
                  return (
                    <li key={c.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start">
                      <Link href={`/${p.slug}`}>
                        <Avatar src={p.profilePhotoUrl} name={fullName} size="md" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/${p.slug}`} className="font-bold text-emce-text hover:underline">
                          {fullName}
                        </Link>
                        {p.headline && (
                          <p className="text-hint text-emce-text-sec line-clamp-1">{p.headline}</p>
                        )}
                        {c.message && (
                          <p className="mt-1 italic rounded-md bg-emce-light-soft p-2 text-hint text-emce-text">
                            “{c.message}”
                          </p>
                        )}
                        <p className="mt-1 text-hint text-emce-text-muted">
                          Invited {relativeTime(c.createdAt)}
                        </p>
                      </div>
                      <div className="flex gap-2 sm:flex-col">
                        <ConnectButton
                          targetUserId={c.requester.id}
                          initialStatus="PENDING_IN"
                          connectionId={c.id}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {pendingOut.length > 0 && (
            <Card>
              <h2 className="text-section text-emce-text">Sent ({pendingOut.length})</h2>
              <ul className="mt-3 divide-y divide-emce-border">
                {pendingOut.map((c) => {
                  const p = c.recipient.candidateProfile;
                  if (!p) return null;
                  const fullName = `${p.firstName} ${p.lastName ?? ""}`.trim();
                  return (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      <Link href={`/${p.slug}`}>
                        <Avatar src={p.profilePhotoUrl} name={fullName} size="sm" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/${p.slug}`} className="font-bold text-emce-text hover:underline">
                          {fullName}
                        </Link>
                        <p className="text-hint text-emce-text-muted">
                          Sent {relativeTime(c.createdAt)}
                        </p>
                      </div>
                      <ConnectButton
                        targetUserId={c.recipient.id}
                        initialStatus="PENDING_OUT"
                        connectionId={c.id}
                      />
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="text-section text-emce-text">Your connections ({accepted.length})</h2>
            {accepted.length === 0 ? (
              <p className="mt-3 text-hint text-emce-text-sec">
                You haven&apos;t connected with anyone yet — start with the suggestions below.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {accepted.map((c) => {
                  const otherUserId = c.requesterId === session.user.id ? c.recipientId : c.requesterId;
                  const otherProfile = c.requesterId === session.user.id ? c.recipient.candidateProfile : c.requester.candidateProfile;
                  if (!otherProfile) return null;
                  const fullName = `${otherProfile.firstName} ${otherProfile.lastName ?? ""}`.trim();
                  return (
                    <li key={c.id} className="flex items-center gap-3 rounded-md border border-emce-border p-3">
                      <Link href={`/${otherProfile.slug}`}>
                        <Avatar src={otherProfile.profilePhotoUrl} name={fullName} size="md" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/${otherProfile.slug}`} className="block truncate text-sm font-bold text-emce-text hover:underline">
                          {fullName}
                        </Link>
                        {otherProfile.headline && (
                          <p className="line-clamp-1 text-hint text-emce-text-sec">{otherProfile.headline}</p>
                        )}
                      </div>
                      <ConnectButton targetUserId={otherUserId} initialStatus="ACCEPTED" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-section text-emce-text">People you may know</h2>
            {suggestions.length === 0 ? (
              <p className="mt-3 text-hint text-emce-text-sec">
                We&apos;ll show suggestions based on your EV domain as more people join.
              </p>
            ) : (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                {suggestions.map((s) => {
                  const fullName = `${s.firstName} ${s.lastName ?? ""}`.trim();
                  return (
                    <li key={s.id} className="rounded-md border border-emce-border p-3">
                      <div className="flex items-start gap-3">
                        <Link href={`/${s.slug}`}>
                          <Avatar src={s.profilePhotoUrl} name={fullName} size="md" />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/${s.slug}`} className="block font-bold text-emce-text hover:underline">
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
                        </div>
                      </div>
                      <div className="mt-2">
                        <ConnectButton targetUserId={s.user.id} initialStatus="NONE" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}
