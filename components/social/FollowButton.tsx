"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  followUser,
  unfollowUser,
  followCompany,
  unfollowCompany,
} from "@/server/social/actions";

interface BaseProps {
  initialFollowing: boolean;
  signedIn: boolean;
  size?: "sm" | "default";
}

export function FollowUserButton({
  userId,
  ...rest
}: BaseProps & { userId: string }) {
  const [following, setFollowing] = useState(rest.initialFollowing);
  const [, start] = useTransition();

  if (!rest.signedIn) {
    return (
      <Button asChild variant="ghost" size={rest.size ?? "default"}>
        <Link href="/signin">Follow</Link>
      </Button>
    );
  }
  function toggle() {
    const next = !following;
    setFollowing(next);
    const fd = new FormData();
    fd.append("userId", userId);
    start(async () => {
      try {
        if (next) await followUser(fd);
        else await unfollowUser(fd);
      } catch {
        setFollowing(!next);
      }
    });
  }
  return (
    <Button
      type="button"
      variant={following ? "outline" : "ghost"}
      size={rest.size ?? "default"}
      onClick={toggle}
    >
      {following ? "✓ Following" : "+ Follow"}
    </Button>
  );
}

export function FollowCompanyButton({
  companyId,
  ...rest
}: BaseProps & { companyId: string }) {
  const [following, setFollowing] = useState(rest.initialFollowing);
  const [, start] = useTransition();

  if (!rest.signedIn) {
    return (
      <Button asChild variant="outline" size={rest.size ?? "default"}>
        <Link href="/signin">Follow</Link>
      </Button>
    );
  }
  function toggle() {
    const next = !following;
    setFollowing(next);
    const fd = new FormData();
    fd.append("companyId", companyId);
    start(async () => {
      try {
        if (next) await followCompany(fd);
        else await unfollowCompany(fd);
      } catch {
        setFollowing(!next);
      }
    });
  }
  return (
    <Button
      type="button"
      variant={following ? "outline" : "default"}
      size={rest.size ?? "default"}
      onClick={toggle}
    >
      {following ? "✓ Following" : "+ Follow"}
    </Button>
  );
}
