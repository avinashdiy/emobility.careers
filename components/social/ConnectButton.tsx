"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  requestConnection,
  withdrawConnection,
  removeConnection,
  respondConnection,
} from "@/server/social/actions";

type Status = "NONE" | "PENDING_OUT" | "PENDING_IN" | "ACCEPTED" | "SELF" | "ANON";

export function ConnectButton({
  targetUserId,
  initialStatus,
  connectionId,
  variant = "default",
  size = "default",
}: {
  targetUserId: string;
  initialStatus: Status;
  connectionId?: string;
  variant?: "default" | "outline";
  /**
   * Forwarded to the underlying Button. Defaults to `default` (h-10)
   * so existing callers don't change. Pass `xs` on dense rows where
   * 6+ buttons need to fit in one line (e.g. the profile page action
   * row, the feed page "People you may know" widget).
   */
  size?: "default" | "sm" | "xs";
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [, start] = useTransition();

  if (status === "SELF") return null;
  if (status === "ANON") {
    return (
      <Button asChild variant={variant} size={size}>
        <Link href="/signin">Sign in to connect</Link>
      </Button>
    );
  }

  function send() {
    const fd = new FormData();
    fd.append("recipientId", targetUserId);
    setStatus("PENDING_OUT");
    start(async () => {
      try {
        await requestConnection(fd);
      } catch {
        setStatus("NONE");
      }
    });
  }

  function withdraw() {
    if (!connectionId) return;
    const fd = new FormData();
    fd.append("id", connectionId);
    setStatus("NONE");
    start(async () => {
      try {
        await withdrawConnection(fd);
      } catch {
        setStatus("PENDING_OUT");
      }
    });
  }

  function accept() {
    if (!connectionId) return;
    const fd = new FormData();
    fd.append("id", connectionId);
    fd.append("accept", "true");
    setStatus("ACCEPTED");
    start(async () => {
      try {
        await respondConnection(fd);
      } catch {
        setStatus("PENDING_IN");
      }
    });
  }

  if (status === "NONE") {
    return (
      <Button type="button" variant={variant} size={size} onClick={send}>
        + Connect
      </Button>
    );
  }
  if (status === "PENDING_OUT") {
    return (
      <Button type="button" variant="outline" size={size} onClick={withdraw}>
        {size === "xs" ? "Pending" : "Pending — Withdraw"}
      </Button>
    );
  }
  if (status === "PENDING_IN") {
    return (
      <Button type="button" size={size} onClick={accept}>
        {size === "xs" ? "Accept" : "Accept request"}
      </Button>
    );
  }
  // ACCEPTED — offer remove (with confirm)
  return (
    <form
      action={async (fd) => {
        fd.append("userId", targetUserId);
        try {
          await removeConnection(fd);
          setStatus("NONE");
        } catch { /* ignore */ }
      }}
    >
      <ConfirmSubmit confirm="Remove this connection?" variant="outline" size={size}>
        ✓ Connected
      </ConfirmSubmit>
    </form>
  );
}
