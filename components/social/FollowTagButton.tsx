"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  subscribeHashtag,
  unsubscribeHashtag,
} from "@/server/social/hashtag-actions";
import { emptyFormState } from "@/lib/form-state";

interface Props {
  tag: string;
  initialFollowing: boolean;
  signedIn: boolean;
  size?: "sm" | "default";
}

/**
 * Mirrors FollowUserButton/FollowCompanyButton — optimistic toggle
 * via useTransition. We don't surface `subscribeHashtag`'s rate-
 * limit message inline; on the rare 30/hr trip the optimistic state
 * just snaps back. Topics aren't a place users grind through 30
 * follows in an hour, so the trade-off is worth the simpler UI.
 */
export function FollowTagButton({
  tag,
  initialFollowing,
  signedIn,
  size = "default",
}: Props) {
  const [following, setFollowing] = useState(initialFollowing);
  const [, start] = useTransition();

  if (!signedIn) {
    return (
      <Button asChild variant="default" size={size}>
        <Link href={`/signin?next=/tag/${encodeURIComponent(tag)}`}>
          Follow #{tag}
        </Link>
      </Button>
    );
  }

  function toggle() {
    const next = !following;
    setFollowing(next);
    const fd = new FormData();
    fd.append("tag", tag);
    start(async () => {
      try {
        if (next) {
          const res = await subscribeHashtag(emptyFormState, fd);
          if (!res.ok) setFollowing(!next);
        } else {
          await unsubscribeHashtag(fd);
        }
      } catch {
        setFollowing(!next);
      }
    });
  }

  return (
    <Button
      type="button"
      variant={following ? "outline" : "default"}
      size={size}
      onClick={toggle}
    >
      {following ? "✓ Following" : "+ Follow"}
    </Button>
  );
}
