import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDiscussionThread } from "@/server/discussions/actions";
import { relativeTime } from "@/lib/utils";

/**
 * Reddit-style discussion section, used by both Company and
 * Institution detail pages. Lists existing threads, lets a signed-in
 * user start a new thread, and links into the per-thread page where
 * replies live.
 *
 * Caller passes:
 *   • the loaded thread list (pre-filtered to PUBLISHED)
 *   • the parent entity's id + type (drives the form's hidden inputs)
 *   • the URL prefix (`/company/<slug>` or `/institutions/<slug>`)
 *   • whether the viewer is signed in (drives the "sign in to post" gate)
 */

export interface DiscussionThreadCard {
  id: string;
  slug: string;
  title: string;
  body: string;
  replyCount: number;
  upvoteCount: number;
  createdAt: Date;
  lastActivity: Date;
  authorName: string;
  authorSlug: string | null;
}

interface Props {
  threads: DiscussionThreadCard[];
  entityType: "COMPANY" | "INSTITUTION";
  entityId: string;
  /// Used to build the per-thread URL — e.g. `/company/u-diyguru`.
  /// The thread URL is `${entityHref}/discuss/${thread.slug}`.
  entityHref: string;
  isSignedIn: boolean;
}

export function EntityDiscussionSection({
  threads,
  entityType,
  entityId,
  entityHref,
  isSignedIn,
}: Props) {
  return (
    <section className="space-y-6" aria-labelledby="discuss-heading">
      <div>
        <h2 id="discuss-heading" className="text-section text-emce-text">
          Discussion ({threads.length})
        </h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Ask questions, share what it&apos;s like to work / study here, and
          help others figure out their next step. Threads are indexed by
          Google and discoverable from search.
        </p>
      </div>

      {/* New-thread form. Signed-in only — anonymous discussion gets
          spammed out of usefulness too fast. */}
      {isSignedIn ? (
        <Card className="p-5">
          <form action={createDiscussionThread} className="space-y-3">
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="entityId" value={entityId} />
            <div>
              <Label htmlFor="d-title">Start a thread</Label>
              <Input
                id="d-title"
                name="title"
                placeholder="e.g. What's the BMS team interview like at DIYguru?"
                required
                minLength={8}
                maxLength={200}
              />
            </div>
            <div>
              <Label htmlFor="d-body">Details</Label>
              <Textarea
                id="d-body"
                name="body"
                placeholder="Add context — what you're curious about, what you already know, who'd be best placed to answer."
                required
                minLength={20}
                maxLength={8000}
                rows={4}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Post thread</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="border-dashed bg-emce-light-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-hint text-emce-text">
              💬 Sign in to start a discussion or reply to existing threads.
            </p>
            <Button asChild size="sm">
              <Link href={`/signin?next=${encodeURIComponent(entityHref)}`}>
                Sign in
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {/* Existing threads — newest activity first */}
      {threads.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-body text-emce-text-sec">
            No threads yet. Be the first to ask.
          </p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {threads.map((t) => (
            <li key={t.id}>
              <Link href={`${entityHref}/discuss/${t.slug}`}>
                <Card className="p-4 transition hover:border-emce-mid hover:shadow-emce-hover">
                  <div className="flex items-start gap-3">
                    <Avatar name={t.authorName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-emce-text">{t.title}</p>
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">
                        {t.body}
                      </p>
                      <p className="mt-2 text-hint text-emce-text-muted">
                        {t.authorName} · {relativeTime(t.createdAt)} ·{" "}
                        {t.replyCount} repl{t.replyCount === 1 ? "y" : "ies"}
                        {t.upvoteCount > 0 && ` · ↑ ${t.upvoteCount}`}
                        {t.lastActivity.getTime() !== t.createdAt.getTime() && (
                          <> · active {relativeTime(t.lastActivity)}</>
                        )}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
