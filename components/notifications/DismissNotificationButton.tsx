"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { dismissNotification } from "@/server/notifications/actions";

/**
 * Per-row "×" affordance on each notification card. Wraps the
 * dismissNotification server action so the user can clear one
 * notification at a time without nuking the whole inbox.
 *
 * Importantly: the notification card itself is wrapped in <Link>
 * (clicking navigates to the notification's target). We stop the
 * pointer + click events here so tapping the X doesn't ALSO trigger
 * the surrounding navigation. preventDefault + stopPropagation
 * together cover both Pointer Events (touch + mouse) and the
 * synthesised click that follows.
 */
export function DismissNotificationButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Without these two, the click bubbles up to the parent <Link>
    // and navigates the user to the notification target right as
    // their notification disappears — confusing UX.
    e.preventDefault();
    e.stopPropagation();

    start(async () => {
      try {
        const fd = new FormData();
        fd.append("id", id);
        await dismissNotification(fd);
        // Tell the live bell badge to decrement if it was unread.
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("notifications:dismissed", { detail: { id } }));
        }
        router.refresh();
      } catch {
        toast.error("Couldn't dismiss. Try again.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      // Stop the surrounding Link from intercepting the pointer down too —
      // some browsers fire navigation on pointerdown before click.
      onPointerDown={(e) => e.stopPropagation()}
      disabled={pending}
      aria-label="Dismiss notification"
      title="Dismiss"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emce-text-muted transition-colors hover:bg-emce-light-soft hover:text-emce-text disabled:opacity-50"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
