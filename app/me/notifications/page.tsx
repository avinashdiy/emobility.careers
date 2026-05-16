import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase, GraduationCap, Trophy, Users, MessageCircle, Bell, FileCheck, AtSign,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { relativeTime } from "@/lib/utils";
import { MarkAllReadButton } from "@/components/notifications/MarkAllReadButton";
import { ClearAllNotificationsButton } from "@/components/notifications/ClearAllNotificationsButton";
import { DismissNotificationButton } from "@/components/notifications/DismissNotificationButton";

export const metadata = { title: "Notifications" };

const TABS = [
  { value: "all", label: "All" },
  { value: "social", label: "Social" },
  { value: "applications", label: "Applications" },
  { value: "mentorship", label: "Mentorship" },
  { value: "competitions", label: "Competitions" },
  { value: "system", label: "System" },
] as const;
type Tab = typeof TABS[number]["value"];

// Notification type → tab routing. Two flavours co-exist in the DB:
//
//   • Dotted prefixes from the post-2026 convention ("application.*",
//     "interview.*", "mentor.*", "competition.*").
//   • Bare strings from the original social/jobs server actions
//     ("reaction", "comment", "reply", "repost", "follow",
//     "connect-request", "connect-accepted", "application-received",
//     "inmail", "invited").
//
// Both shapes route to the same tabs here so the recruiter / candidate
// inbox surfaces every notification rather than silently dumping the
// bare-string ones into "System" — that was the bug recruiters hit
// where likes / comments / job-apply pings looked like they weren't
// firing.
function categorise(type: string): Exclude<Tab, "all"> {
  // SOCIAL — feed reactions, comments, connections, follows, reposts.
  if (
    type.startsWith("social.") ||
    type.startsWith("connection.") ||
    type.startsWith("post.") ||
    type.startsWith("follow.") ||
    type.startsWith("comment.") ||
    type === "reaction" ||
    type === "comment" ||
    type === "reply" ||
    type === "repost" ||
    type === "follow" ||
    type === "connect-request" ||
    type === "connect-accepted"
  ) {
    return "social";
  }
  // APPLICATIONS — job-side updates that hit the candidate inbox.
  if (
    type.startsWith("interview.") ||
    type.startsWith("application.") ||
    type.startsWith("job.") ||
    type === "application-received" ||
    type === "application-stage-changed" ||
    type === "inmail" ||
    type === "invited"
  ) {
    return "applications";
  }
  if (type.startsWith("mentor") || type.startsWith("mentorship.")) return "mentorship";
  if (type.startsWith("competition.")) return "competitions";
  return "system";
}

const ICON: Record<Exclude<Tab, "all">, React.ComponentType<{ className?: string }>> = {
  social: Users,
  applications: Briefcase,
  mentorship: GraduationCap,
  competitions: Trophy,
  system: Bell,
};

function iconFor(type: string) {
  if (type.includes("message")) return MessageCircle;
  if (type.includes("mention") || type.includes("@")) return AtSign;
  if (type.includes("verified") || type.includes("approved")) return FileCheck;
  return ICON[categorise(type)];
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/notifications");
  const sp = await searchParams;
  const tab: Tab = sp.tab && TABS.some((t) => t.value === sp.tab) ? sp.tab : "all";

  // Pull notifications + the actor's candidate-profile shape in one
  // round-trip. Actor relation is nullable (system events leave it
  // null); we render an icon-tile fallback in those cases.
  const all = await db.notification.findMany({
    where: { userId: session.user.id, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      actor: {
        select: {
          name: true,
          candidateProfile: {
            select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true },
          },
        },
      },
    },
  });
  const filtered = tab === "all" ? all : all.filter((n) => categorise(n.type) === tab);

  // Mark visible ones as read on view (LinkedIn-style behaviour).
  const unseenIds = filtered.filter((n) => !n.readAt).map((n) => n.id);
  if (unseenIds.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: unseenIds } },
      data: { readAt: new Date() },
    });
  }

  const totalUnread = all.filter((n) => !n.readAt).length;

  const counts = TABS.reduce<Record<Tab, number>>(
    (acc, t) => {
      acc[t.value] = t.value === "all" ? all.length : all.filter((n) => categorise(n.type) === t.value).length;
      return acc;
    },
    { all: 0, social: 0, applications: 0, mentorship: 0, competitions: 0, system: 0 },
  );

  return (
    <div className="container max-w-3xl py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 animate-fade-up">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
            🔔 Inbox
          </p>
          <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
            Notifications
            {totalUnread > 0 && (
              <span className="ml-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-emce-mid px-1.5 text-xs font-extrabold text-emce-darkest tabular-nums">
                {totalUnread}
              </span>
            )}
          </h1>
        </div>
        {/* Action cluster — "Mark all read" only renders when there's
            an unread to mark; "Clear all" shows whenever the inbox
            has any row, since the user might want to wipe even
            already-read history. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {totalUnread > 0 && <MarkAllReadButton />}
          {all.length > 0 && <ClearAllNotificationsButton />}
        </div>
      </div>
      <nav className="mt-4 flex gap-1 overflow-x-auto rounded-md border border-emce-border p-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/me/notifications${t.value === "all" ? "" : `?tab=${t.value}`}`}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold ${t.value === tab ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
          >
            <span>{t.label}</span>
            {counts[t.value] > 0 && (
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${t.value === tab ? "bg-emce-mid text-emce-darkest" : "bg-emce-light-soft text-emce-text-sec"}`}>
                {counts[t.value]}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon="🔔"
          title={tab === "all" ? "All caught up" : "Nothing here yet"}
          body="You'll see updates here as people react to your work, jobs change stage, or your mentor sessions approach."
        />
      ) : (
        <ul className="emce-stagger mt-6 space-y-2">
          {filtered.map((n) => {
            const Icon = iconFor(n.type);
            const unread = !n.readAt && !unseenIds.includes(n.id);
            const cp = n.actor?.candidateProfile;
            const actorName = cp
              ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
              : n.actor?.name ?? null;
            return (
              <li key={n.id}>
                {/* Row layout — the body is a Link to the notification's
                    target, and the dismiss button sits as a SIBLING (not
                    a child of the Link) so clicking × doesn't trigger
                    navigation. The wrapper is a relative-positioned
                    Card so we can absolute-position the × in the top
                    corner without affecting content flow. */}
                <Card className={`relative p-4 ${unread ? "ring-2 ring-emce-mid" : ""}`}>
                  <Link href={n.link ?? "#"} className="block">
                    <div className="flex items-start gap-3 pr-8">
                      {/* Actor avatar when available — shows who triggered
                          the notification. Falls back to a category icon
                          (system events, job alerts, etc). */}
                      {actorName ? (
                        <Avatar
                          src={cp?.profilePhotoUrl ?? null}
                          name={actorName}
                          size="md"
                          className="shrink-0"
                        />
                      ) : (
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emce-light-soft text-emce-darkest">
                          <Icon className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-emce-text">{n.title}</p>
                        <p className="mt-0.5 text-sm text-emce-text-sec">{n.body}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-emce-text-sec">
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2">
                    <DismissNotificationButton id={n.id} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
