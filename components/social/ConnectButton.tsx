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
}: {
  targetUserId: string;
  initialStatus: Status;
  connectionId?: string;
  variant?: "default" | "outline";
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [, start] = useTransition();

  if (status === "SELF") return null;
  if (status === "ANON") {
    return (
      <Button asChild variant={variant}>
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
      <Button type="button" variant={variant} onClick={send}>
        + Connect
      </Button>
    );
  }
  if (status === "PENDING_OUT") {
    return (
      <Button type="button" variant="outline" onClick={withdraw}>
        Pending — Withdraw
      </Button>
    );
  }
  if (status === "PENDING_IN") {
    return (
      <Button type="button" onClick={accept}>
        Accept request
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
      <ConfirmSubmit confirm="Remove this connection?" variant="outline">
        ✓ Connected
      </ConfirmSubmit>
    </form>
  );
}
