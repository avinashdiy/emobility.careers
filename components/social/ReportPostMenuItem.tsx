"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { reportPost } from "@/server/moderation/actions";
import { toast } from "sonner";
import { Flag, X } from "lucide-react";

const REASONS: { value: string; label: string }[] = [
  { value: "SPAM", label: "Spam or duplicate" },
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "MISINFORMATION", label: "Misinformation" },
  { value: "INAPPROPRIATE", label: "Inappropriate / NSFW" },
  { value: "HATE_SPEECH", label: "Hate speech" },
  { value: "OFF_TOPIC", label: "Off-topic for an EV careers feed" },
  { value: "OTHER", label: "Other" },
];

/**
 * Inline report-post dialog launched from the PostActions menu.
 * Opens a minimalist sheet next to the post that asks for a reason
 * + optional context, then calls the `reportPost` server action.
 *
 * Keeps the surface light intentionally — heavy modals on a feed
 * card hurt scroll perf and feel disproportionate for what is, in
 * effect, a one-click "tell the mods" gesture.
 */
export function ReportPostMenuItem({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState<string>("SPAM");
  const [details, setDetails] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const fd = new FormData();
    fd.set("postId", postId);
    fd.set("reason", reason);
    if (details.trim()) fd.set("details", details.trim());
    startTransition(async () => {
      const r = await reportPost(fd);
      if (r.ok) {
        toast.success(r.message);
        onClose();
      } else {
        toast.error(r.message);
      }
    });
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-emce-light-soft"
      >
        <Flag className="h-4 w-4 text-emce-text-sec" aria-hidden />
        <span>Report post</span>
      </button>
    );
  }

  return (
    <div className="space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-emce-text">Why are you reporting this?</p>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          aria-label="Cancel report"
          className="text-emce-text-sec hover:text-emce-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div>
        <Label htmlFor={`report-reason-${postId}`} className="text-xs">Reason</Label>
        <NativeSelect
          id={`report-reason-${postId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <Label htmlFor={`report-details-${postId}`} className="text-xs">
          Anything we should know? (optional)
        </Label>
        <Textarea
          id={`report-details-${postId}`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Add context — links, screenshots, who's targeted…"
        />
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={handleSubmit}
      >
        {pending ? "Sending…" : "Send report"}
      </Button>
    </div>
  );
}
