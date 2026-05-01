"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Mail, X, Send } from "lucide-react";
import { toast } from "sonner";
import { requestContactShare } from "@/server/contact-share/actions";

/**
 * Recruiter-facing CTA shown on a candidate's public profile when
 * contact info is hidden. Clicking opens an inline composer for the
 * "I'd like to reach out about ..." message; submit fires the server
 * action and a notification lands in the candidate's inbox.
 *
 * The button only renders when the viewer is an EMPLOYER role and
 * `canSeeContact` is false — both checks happen on the server-rendered
 * profile page; this component is just the UI layer.
 *
 * State labels mirror the underlying ContactShareRequest status so
 * a recruiter who's already pending sees "Request sent" instead of
 * a fresh CTA. Granted state isn't shown here because in that case
 * the contact card itself renders (canSeeContact returns true) and
 * this button is hidden by the parent.
 */
export function RequestContactButton({
  targetUserId,
  targetFirstName,
  initialStatus,
}: {
  targetUserId: string;
  targetFirstName: string;
  /// Existing ContactShareRequest status if any. Drives the closed
  /// state of the button so a returning recruiter sees "Pending"
  /// instead of being able to spam another request.
  initialStatus: "NONE" | "PENDING" | "DENIED" | "REVOKED" | "EXPIRED" | null;
}) {
  const [status, setStatus] = useState(initialStatus ?? "NONE");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        const r = await requestContactShare({
          targetUserId,
          message: message.trim() || undefined,
        });
        if (r.ok) {
          toast.success(r.message);
          setStatus("PENDING");
          setOpen(false);
          setMessage("");
        } else {
          toast.error(r.message);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[contact-share] request failed", err);
        toast.error("Couldn't send request. Try again in a moment.");
      }
    });
  }

  if (status === "PENDING") {
    return (
      <Button variant="outline" size="sm" disabled className="opacity-70">
        <Mail className="mr-1 h-4 w-4" aria-hidden /> Request sent · awaiting reply
      </Button>
    );
  }

  if (status === "DENIED") {
    return (
      <Button variant="outline" size="sm" disabled className="opacity-70">
        Contact request declined
      </Button>
    );
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Mail className="mr-1 h-4 w-4" aria-hidden /> Request contact
      </Button>
    );
  }

  return (
    <Card className="mt-2 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-section text-emce-text">
          Ask {targetFirstName} for their email + phone
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="text-emce-text-sec hover:text-emce-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-hint text-emce-text-sec">
        They'll get a notification in their inbox. If they approve, you'll see
        their contact on this profile and in the ATS. They can revoke later.
      </p>
      <div className="mt-3">
        <Label htmlFor="contact-share-message" className="text-xs">
          Add a short note (optional)
        </Label>
        <Textarea
          id="contact-share-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder={`Hi ${targetFirstName} — we'd love to talk to you about a battery-systems engineer role at our company.`}
          className="mt-1"
        />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={pending}>
          <Send className="mr-1 h-3.5 w-3.5" aria-hidden />
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </Card>
  );
}
