import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { unsubscribeHashtag } from "@/server/social/hashtag-actions";
import { prettifyHashtag } from "@/lib/social/hashtag";
import { AddTopicForm } from "@/components/social/AddTopicForm";

export const metadata = { title: "Your topics" };

/**
 * Manage page for the user's followed hashtags. Two surfaces:
 *   • Add — single-input form with the same validation as the
 *     /tag/[slug] follow button (uses subscribeHashtag).
 *   • Remove — one-click unsubscribe per chip.
 *
 * No bulk-edit UI in v1 — the onboarding step covers the "follow
 * 5 at once" use case, and ad-hoc tweaks are the realistic ongoing
 * shape.
 */
export default async function MyTopicsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/topics");

  const subs = await db.hashtagSubscription.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, tag: true, createdAt: true },
  });

  return (
    <div className="container max-w-3xl py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-dashboard text-emce-text">Your topics</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Following a topic surfaces matching posts in the{" "}
            <Link href="/feed?tab=for-you" className="font-bold text-emce-dark hover:underline">
              For-you feed
            </Link>
            .
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/topics">Browse topics →</Link>
        </Button>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="text-section text-emce-text">Add a topic</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Type a tag — e.g. <code>battery-engineering</code>, <code>charging</code>, <code>bms</code>.
        </p>
        <div className="mt-3">
          <AddTopicForm />
        </div>
      </Card>

      <Card className="mt-4 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-section text-emce-text">Following</h2>
          <span className="text-hint text-emce-text-sec">
            {subs.length} topic{subs.length === 1 ? "" : "s"}
          </span>
        </div>

        {subs.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-emce-border p-6 text-center">
            <p className="text-sm text-emce-text">No topics yet.</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              Add one above, or pick a few from the discovery page.
            </p>
            <Button asChild className="mt-3" size="sm">
              <Link href="/topics">Browse topics →</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {subs.map((s) => (
              <li
                key={s.id}
                className="group inline-flex items-center gap-1 rounded-full border border-emce-border bg-emce-light-soft py-1 pl-3 pr-1 text-sm"
              >
                <Link
                  href={`/tag/${s.tag}`}
                  className="font-bold text-emce-dark hover:underline"
                  title={prettifyHashtag(s.tag)}
                >
                  #{s.tag}
                </Link>
                <form action={unsubscribeHashtag}>
                  <input type="hidden" name="tag" value={s.tag} />
                  <button
                    type="submit"
                    aria-label={`Unfollow #${s.tag}`}
                    className="ml-1 rounded-full px-2 py-0.5 text-xs text-emce-text-sec hover:bg-white hover:text-emce-text"
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
