"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { markAllNotificationsRead } from "@/server/notifications/actions";

/**
 * "Mark all as read" CTA on /me/notifications. Calls the server action
 * (single bulk UPDATE in the DB), then dispatches a `notifications:reset`
 * window event so the live bell badge in the SiteHeader zeroes out
 * without waiting for a navigation cycle.
 */
export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    start(async () => {
      try {
        await markAllNotificationsRead();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("notifications:reset"));
        }
        toast.success("Marked all as read");
        router.refresh();
      } catch {
        toast.error("Couldn't mark all read. Try again.");
      }
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onClick}>
      <CheckCheck className="mr-1 h-3.5 w-3.5" />
      {pending ? "Marking…" : "Mark all read"}
    </Button>
  );
}
