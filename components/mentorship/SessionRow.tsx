"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  setSessionMeetingUrl,
  markSessionCompleted,
  cancelSession,
  submitReview,
} from "@/server/mentorship/actions";
import { formatMinor } from "@/components/mentorship/PriceLabel";

const STATUS_TONE: Record<string, "default" | "warning" | "verified" | "outline"> = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "verified",
  COMPLETED: "default",
  CANCELLED: "outline",
  NO_SHOW: "outline",
  REFUNDED: "outline",
};

export interface SessionRowItem {
  id: string;
  scheduledAt: string;
  durationMins: number;
  mode: string;
  status: string;
  paymentStatus: string;
  topic: string;
  meetingUrl: string | null;
  priceMinor: number;
  currency: string;
  hasReview: boolean;
  counterpart: { name: string; photoUrl: string | null; slug?: string };
}

export function SessionRow({
  s,
  perspective,
}: {
  s: SessionRowItem;
  perspective: "mentor" | "mentee";
}) {
  const [pending, startTransition] = useTransition();
  const [meetingUrl, setMeetingUrl] = useState(s.meetingUrl ?? "");
  const [showCancel, setShowCancel] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");

  const upcoming = new Date(s.scheduledAt).getTime() > Date.now();
  const isLive =
    new Date(s.scheduledAt).getTime() <= Date.now() &&
    new Date(s.scheduledAt).getTime() + s.durationMins * 60_000 > Date.now();

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Avatar src={s.counterpart.photoUrl} name={s.counterpart.name} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-emce-text">{s.counterpart.name}</span>
              <Badge variant={STATUS_TONE[s.status]} className="text-[10px]">{s.status.replace("_", " ")}</Badge>
              {isLive && <Badge variant="warning" className="text-[10px]">Live now</Badge>}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-emce-text">{s.topic}</p>
            <p className="mt-1 text-hint text-emce-text-sec">
              {new Date(s.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {s.durationMins} min · {s.mode.toLowerCase()}
              {s.paymentStatus !== "FREE" && ` · ${formatMinor(s.priceMinor, s.currency)} (${s.paymentStatus})`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {s.meetingUrl && (s.status === "CONFIRMED" || s.status === "COMPLETED") && (
            <Button asChild size="sm" variant="accent">
              <a href={s.meetingUrl} target="_blank" rel="noreferrer">Join</a>
            </Button>
          )}
          {perspective === "mentor" && s.status === "CONFIRMED" && upcoming && (
            <Button size="sm" variant="outline" onClick={() => {/* expand inline below */}} className="hidden">.</Button>
          )}
          {perspective === "mentor" && s.status === "CONFIRMED" && (
            <Button size="sm" variant="outline" onClick={() => setShowComplete((v) => !v)}>
              Mark complete
            </Button>
          )}
          {(s.status === "PENDING_PAYMENT" || s.status === "CONFIRMED") && upcoming && (
            <Button size="sm" variant="ghost" onClick={() => setShowCancel((v) => !v)}>
              Cancel
            </Button>
          )}
          {perspective === "mentee" && s.status === "COMPLETED" && !s.hasReview && (
            <Button size="sm" variant="accent" onClick={() => setShowReview((v) => !v)}>
              Leave review
            </Button>
          )}
        </div>
      </div>

      {perspective === "mentor" && s.status === "CONFIRMED" && (
        <div className="mt-3 grid gap-2 sm:grid-cols-12">
          <div className="sm:col-span-9">
            <Label htmlFor={`url-${s.id}`}>Meeting URL (Meet / Zoom / Teams)</Label>
            <Input
              id={`url-${s.id}`}
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              placeholder="https://meet.google.com/…"
            />
          </div>
          <div className="sm:col-span-3 flex items-end">
            <Button
              size="sm"
              disabled={pending || !meetingUrl}
              onClick={() => startTransition(async () => {
                const r = await setSessionMeetingUrl(s.id, meetingUrl);
                r.ok ? toast.success("Saved.") : toast.error(r.message ?? "Failed.");
              })}
              className="w-full"
            >Save link</Button>
          </div>
        </div>
      )}

      {showComplete && (
        <div className="mt-3 space-y-2 rounded-md bg-emce-light-soft p-3">
          <Label htmlFor={`notes-${s.id}`}>Mentor notes (optional)</Label>
          <Textarea
            id={`notes-${s.id}`}
            value={completeNotes}
            onChange={(e) => setCompleteNotes(e.target.value)}
            rows={2}
            placeholder="Anything for the mentee or your records."
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowComplete(false)}>Cancel</Button>
            <Button
              size="sm"
              variant="accent"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const r = await markSessionCompleted(s.id, completeNotes || null);
                r.ok ? toast.success("Marked complete.") : toast.error(r.message ?? "Failed.");
                setShowComplete(false);
              })}
            >Confirm</Button>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="mt-3 space-y-2 rounded-md bg-emce-red-light p-3">
          <Label htmlFor={`reason-${s.id}`}>Reason for cancellation</Label>
          <Input
            id={`reason-${s.id}`}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            required
            placeholder="Brief reason — visible to the other party."
          />
          <p className="text-hint text-emce-red-deep">
            Paid sessions cancelled &gt;24h ahead get an automatic refund flag for admin to process.
          </p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowCancel(false)}>Keep session</Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !cancelReason}
              onClick={() => startTransition(async () => {
                const r = await cancelSession(s.id, cancelReason);
                r.ok ? toast.success("Cancelled.") : toast.error(r.message ?? "Failed.");
                setShowCancel(false);
              })}
            >Confirm cancel</Button>
          </div>
        </div>
      )}

      {showReview && <ReviewForm sessionId={s.id} onClose={() => setShowReview(false)} />}
    </Card>
  );
}

function ReviewForm({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        fd.set("sessionId", sessionId);
        startTransition(async () => {
          const r = await submitReview({ ok: false }, fd);
          r.ok ? toast.success(r.message ?? "Review submitted.") : toast.error(r.message ?? "Failed.");
          if (r.ok) onClose();
        });
      }}
      className="mt-3 space-y-2 rounded-md bg-emce-light-soft p-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Label>Rating</Label>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex items-center gap-1 text-sm">
            <input type="radio" name="rating" value={n} defaultChecked={n === 5} required /> {n}★
          </label>
        ))}
        <label className="ml-auto flex items-center gap-1 text-sm">
          <input type="checkbox" name="isPublic" value="on" defaultChecked /> Show on mentor's public profile
        </label>
      </div>
      <div>
        <Label htmlFor={`body-${sessionId}`}>Comments (optional)</Label>
        <Textarea id={`body-${sessionId}`} name="body" rows={3} maxLength={2000} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button size="sm" variant="accent" type="submit" disabled={pending}>Submit review</Button>
      </div>
    </form>
  );
}
