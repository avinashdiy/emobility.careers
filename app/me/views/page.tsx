import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  getProfileViewers,
  getProfileViewStats,
  type ProfileViewerRow,
} from "@/server/profile/views";
import { setViewerVisibility } from "@/server/profile/view-actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Who viewed your profile" };

/**
 * The "Who viewed your profile" detail surface. Mirrors LinkedIn's
 * /me/profile-views shape:
 *   • headline stats (7d / 30d totals)
 *   • a list of recent viewers — anonymous rows show as a generic
 *     placeholder, identified rows show avatar + name + headline
 *   • a privacy toggle that flips the viewer's own visibility
 *     mode. The toggle's reciprocal-cost is spelled out inline so
 *     users understand they trade their own view of others.
 *
 * Source labels (`source` on each ProfileView) are surfaced in
 * small grey copy ("Viewed from search") — recruiters and active
 * candidates use this signal to understand discovery channels.
 */
export default async function MyProfileViewsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/views");

  const me = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { viewerVisibility: true },
  });
  if (!me) redirect("/onboarding");
  const isAnonymous = me.viewerVisibility === "ANONYMOUS";

  // Stats + recent rows in parallel. 30-day window for the
  // headline stat; 90-day cap on the list (the list is also
  // limited to 50 rows so it doesn't grow unbounded).
  const [stats7, stats30, viewers] = await Promise.all([
    getProfileViewStats(session.user.id, 7),
    getProfileViewStats(session.user.id, 30),
    getProfileViewers(session.user.id, { limit: 50 }),
  ]);

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-dashboard text-emce-text">Who viewed your profile</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        Anyone who opens your public profile is counted here. Refreshes within
        24 hours don&apos;t double-count.
      </p>

      {/* Privacy banner — VISIBLE-mode users see "you're visible";
          ANONYMOUS-mode users see a warning that they only get
          anonymous-shape rows. Reciprocity is core to the design,
          so spell it out. */}
      <Card className="mt-6 p-4">
        <form
          action={setViewerVisibility}
          className="flex flex-wrap items-start justify-between gap-3"
        >
          <div className="flex items-start gap-2">
            {isAnonymous ? (
              <EyeOff className="mt-0.5 h-4 w-4 text-emce-text-sec" />
            ) : (
              <Eye className="mt-0.5 h-4 w-4 text-emce-darkest" />
            )}
            <div>
              <p className="text-sm font-bold text-emce-text">
                {isAnonymous
                  ? "You're browsing in private mode"
                  : "You appear by name when you view profiles"}
              </p>
              <p className="mt-0.5 text-hint text-emce-text-sec">
                {isAnonymous
                  ? "Viewers see only an anonymous label — and you only see anonymous rows in the list below."
                  : "Switch to private mode to hide your identity. Trade-off: you'll only see anonymous-shape rows here too."}
              </p>
            </div>
          </div>
          <input
            type="hidden"
            name="viewerVisibility"
            value={isAnonymous ? "VISIBLE" : "ANONYMOUS"}
          />
          <Button type="submit" size="sm" variant="outline">
            {isAnonymous ? "Show my identity" : "Browse anonymously"}
          </Button>
        </form>
      </Card>

      {/* Stats strip */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Last 7 days" value={stats7.total} />
        <StatTile label="Last 30 days" value={stats30.total} />
        <StatTile
          label="Anonymous (30d)"
          value={stats30.anonymous}
          dim
        />
      </div>

      {/* Reciprocal-cost gate. ANONYMOUS-mode users still see the
          stats above (those are aggregate, not identifying), but
          the per-row list strips identity for everyone — even
          rows where the viewer was VISIBLE. Same shape LinkedIn
          ships. */}
      <Card className="mt-4 p-4">
        <h2 className="text-section text-emce-text">Recent viewers</h2>
        {viewers.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-emce-border p-6 text-center">
            <p className="text-sm text-emce-text">No views yet</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Share your profile or post regularly to start showing up.
            </p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-emce-border">
            {viewers.map((v) => (
              <ViewerRow key={v.id} view={v} hideIdentity={isAnonymous} />
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-center text-hint text-emce-text-sec">
        Views are kept for 90 days then auto-deleted.{" "}
        <Link href="/me/profile" className="font-bold text-emce-dark hover:underline">
          Edit your profile →
        </Link>
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  dim,
}: {
  label: string;
  value: number;
  dim?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-emce-border p-3 ${
        dim ? "bg-emce-light-soft" : "bg-white"
      }`}
    >
      <p className="text-hint uppercase tracking-wide text-emce-text-sec">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-emce-text">{value.toLocaleString()}</p>
    </div>
  );
}

function ViewerRow({
  view,
  hideIdentity,
}: {
  view: ProfileViewerRow;
  hideIdentity: boolean;
}) {
  // Reciprocal-anonymity: when the OWNING user is in ANONYMOUS
  // mode, every row is rendered as anonymous regardless of the
  // viewer's mode. Otherwise, the viewer's wasAnonymous flag (set
  // at write-time) determines whether identity surfaces.
  const showIdentity = !hideIdentity && !view.wasAnonymous && view.viewerUser?.candidateProfile;
  const profile = view.viewerUser?.candidateProfile;
  const fullName = profile
    ? `${profile.firstName} ${profile.lastName ?? ""}`.trim()
    : null;

  if (showIdentity && profile && fullName) {
    return (
      <li className="flex items-start gap-3 py-3">
        <Link href={`/${profile.slug}`}>
          <Avatar src={profile.profilePhotoUrl} name={fullName} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/${profile.slug}`}
            className="block text-sm font-bold text-emce-text hover:underline"
          >
            {fullName}
          </Link>
          {profile.headline && (
            <p className="line-clamp-1 text-hint text-emce-text-sec">{profile.headline}</p>
          )}
          <p className="mt-0.5 text-hint text-emce-text-muted">
            {relativeTime(view.createdAt)}
            {view.source && <> · viewed from {sourceLabel(view.source)}</>}
          </p>
        </div>
      </li>
    );
  }

  // Anonymous row. Two reasons it's anonymous: (a) the viewer chose
  // ANONYMOUS at write-time, or (b) THIS user is in ANONYMOUS mode
  // (reciprocal cost). We tell the user which, because the
  // distinction matters for their toggle decision.
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-emce-light-soft text-emce-text-sec">
        <EyeOff className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-emce-text">
          {view.wasAnonymous
            ? "Someone viewing in private mode"
            : view.viewerUser
              ? "A signed-in viewer"
              : "An anonymous visitor"}
        </p>
        <p className="mt-0.5 text-hint text-emce-text-muted">
          {relativeTime(view.createdAt)}
          {view.source && <> · viewed from {sourceLabel(view.source)}</>}
        </p>
        {hideIdentity && !view.wasAnonymous && (
          <p className="mt-1 text-hint text-emce-text-sec">
            Switch off private mode to see who this was.
          </p>
        )}
      </div>
    </li>
  );
}

/** Map raw source codes to friendly labels. */
function sourceLabel(source: string): string {
  switch (source) {
    case "profile-direct":
      return "your profile";
    case "feed":
      return "the feed";
    case "search":
      return "search";
    case "tag":
      return "a hashtag page";
    case "post-author":
      return "a post";
    case "company-page-team":
      return "a company page";
    default:
      return source;
  }
}
