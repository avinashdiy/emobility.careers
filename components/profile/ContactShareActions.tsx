"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  grantContactShare,
  denyContactShare,
  revokeContactShare,
} from "@/server/contact-share/actions";

/**
 * Per-row action cluster used by both the candidate's contact-shares
 * inbox AND the inline approve/deny chip on the share-request
 * notification card. Each variant shows only the buttons relevant to
 * the row's current status.
 */
export function ContactShareActions({
  requestId,
  status,
  /// Whether to render in compact mode (notification card) or full
  /// mode (the /me/contact-shares page). Compact hides the deny-reason
  /// textarea and shrinks the buttons.
  compact = false,
}: {
  requestId: string;
  status: "PENDING" | "GRANTED" | "DENIED" | "REVOKED" | "EXPIRED";
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showDenyReason, setShowDenyReason] = useState(false);
  const [denyReason, setDenyReason] = useState("");

  function withTransition(fn: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      try {
        const r = await fn();
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
        router.refresh();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[contact-share-actions]", err);
        toast.error("Couldn't process — try again in a moment.");
      }
    });
  }

  if (status === "PENDING") {
    return (
      <div className={compact ? "flex flex-wrap gap-2" : "space-y-2"}>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              withTransition(() => grantContactShare({ requestId }))
            }
          >
            <Check className="mr-1 h-3.5 w-3.5" aria-hidden /> Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!showDenyReason && !compact) {
                setShowDenyReason(true);
              } else {
                withTransition(() =>
                  denyContactShare({
                    requestId,
                    reason: denyReason.trim() || undefined,
                  }),
                );
              }
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Decline
          </Button>
        </div>
        {showDenyReason && !compact && (
          <Textarea
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Optional — tell them why (private to you and them)"
            aria-label="Reason for declining"
          />
        )}
      </div>
    );
  }

  if (status === "GRANTED") {
    return (
      <ConfirmSubmit
        confirm="Revoke contact access? They'll lose access immediately. They can re-request later."
        size="sm"
        variant="ghost"
        onClick={(e) => {
          e.preventDefault();
          withTransition(() => revokeContactShare({ requestId }));
        }}
      >
        Revoke access
      </ConfirmSubmit>
    );
  }

  // DENIED / REVOKED / EXPIRED — read-only history rows. No actions.
  return null;
}
