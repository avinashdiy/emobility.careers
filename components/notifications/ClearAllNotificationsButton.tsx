"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearAllNotifications } from "@/server/notifications/actions";

/**
 * Header "Clear all" CTA on /me/notifications. Wraps the
 * clearAllNotifications server action with a native confirm() —
 * destructive bulk delete needs a beat where the user can back out.
 *
 * Sits next to "Mark all read" in the header. Visibility differs:
 *   • "Mark all read" shows only when there's at least one unread
 *     row (no point if everything's already read).
 *   • "Clear all" shows whenever there's at least one row, since
 *     the goal is to remove from the list, regardless of read state.
 */
export function ClearAllNotificationsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick() {
    const ok = window.confirm(
      "Clear all notifications? This permanently deletes every notification in your inbox.",
    );
    if (!ok) return;
    start(async () => {
      try {
        await clearAllNotifications();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("notifications:reset"));
        }
        toast.success("Notifications cleared");
        router.refresh();
      } catch {
        toast.error("Couldn't clear. Try again.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={onClick}
      className="text-emce-red-deep hover:bg-emce-red-light"
    >
      <Trash2 className="mr-1 h-3.5 w-3.5" />
      {pending ? "Clearing…" : "Clear all"}
    </Button>
  );
}
