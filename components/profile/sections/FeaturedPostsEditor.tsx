import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { togglePostFeatured } from "@/server/candidates/actions";
import { relativeTime } from "@/lib/utils";
import { Pin, PinOff } from "lucide-react";

interface OwnPost {
  id: string;
  body: string;
  featured: boolean;
  featuredAt: Date | null;
  createdAt: Date;
  reactionsCount: number;
  commentsCount: number;
  kind: string;
  articleTitle: string | null;
}

/**
 * Pinned-posts editor for /me/profile. Renders the candidate's most
 * recent posts and lets them pin up to 3 to the top of their public
 * profile. The toggle action enforces the cap server-side and
 * auto-rotates the oldest pin off when the user pins a new one
 * already at the limit.
 */
export function FeaturedPostsEditor({ posts }: { posts: OwnPost[] }) {
  if (posts.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Featured on your profile</h2>
        <p className="mt-2 text-hint text-emce-text-sec">
          You haven&apos;t posted anything yet. Once you publish a post or
          article in the feed, you can pin up to 3 here so they show
          above your About on the public profile.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/feed">Go to feed →</Link>
        </Button>
      </Card>
    );
  }

  const featuredCount = posts.filter((p) => p.featured).length;

  return (
    <Card className="p-6">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-section text-emce-text">Featured on your profile</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Pin up to 3 posts. Pinning a 4th replaces the oldest pin.
          </p>
        </div>
        <Badge variant="default" size="sm">
          {featuredCount} / 3 pinned
        </Badge>
      </div>

      <ul className="mt-4 space-y-2">
        {posts.map((p) => (
          <li
            key={p.id}
            className={`flex items-start justify-between gap-3 rounded-md border p-3 ${
              p.featured
                ? "border-emce-mid bg-emce-light-soft"
                : "border-emce-border"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {p.featured && (
                  <Badge variant="success" size="sm">
                    📌 Featured
                  </Badge>
                )}
                {p.kind === "ARTICLE" && p.articleTitle ? (
                  <span className="line-clamp-1 font-bold text-emce-text">
                    {p.articleTitle}
                  </span>
                ) : (
                  <span className="line-clamp-1 text-sm text-emce-text">
                    {p.body || "(empty post)"}
                  </span>
                )}
              </div>
              <p className="text-hint text-emce-text-muted">
                {relativeTime(p.createdAt)} · {p.reactionsCount} ❤️ · {p.commentsCount} 💬
              </p>
            </div>
            <form action={togglePostFeatured}>
              <input type="hidden" name="postId" value={p.id} />
              <Button
                type="submit"
                variant={p.featured ? "ghost" : "outline"}
                size="sm"
                className="shrink-0"
                aria-label={p.featured ? "Unpin post" : "Pin post"}
              >
                {p.featured ? (
                  <>
                    <PinOff className="mr-1 h-4 w-4" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="mr-1 h-4 w-4" />
                    Pin
                  </>
                )}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </Card>
  );
}
