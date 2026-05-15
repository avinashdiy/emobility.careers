"use client";

import { useState, useTransition, useId } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { toast } from "sonner";
import { createMentorshipBooking, confirmMentorshipPayment } from "@/server/mentorship/actions";
import { formatMinor } from "@/components/mentorship/PriceLabel";

declare global {
  interface Window {
    Razorpay?: new (opts: RazorpayOptions) => { open(): void };
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  handler: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

interface Slot {
  start: string;
  end: string;
}

interface Props {
  mentorId: string;
  mentorName: string;
  mentorPhotoUrl?: string | null;
  pricePerSessionMinor: number;
  currency: string;
  acceptingFree: boolean;
  acceptingPaid: boolean;
  sessionDurations: number[];
  defaultMode: "VIDEO" | "PHONE" | "CHAT";
  slots: Slot[];
  viewerEmail: string;
  viewerName: string;
}

export function BookingDialog(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [duration, setDuration] = useState<number>(props.sessionDurations[0] ?? 30);
  const [mode, setMode] = useState(props.defaultMode);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [requestFree, setRequestFree] = useState(props.acceptingFree && !props.acceptingPaid);
  const [pending, startTransition] = useTransition();
  const formId = useId();

  const willBeFree = requestFree && props.acceptingFree;

  const slotsByDay = groupSlotsByDay(props.slots);

  function reset() {
    setSelectedSlot(null);
    setTopic("");
    setNotes("");
  }

  function submitBooking(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSlot) {
      toast.error("Pick a slot first.");
      return;
    }
    if (topic.trim().length < 10) {
      toast.error("Tell the mentor what you want to discuss (10+ chars).");
      return;
    }
    const fd = new FormData();
    fd.set("mentorId", props.mentorId);
    fd.set("scheduledAt", selectedSlot.start);
    fd.set("durationMins", String(duration));
    fd.set("topic", topic);
    fd.set("menteeNotes", notes);
    fd.set("mode", mode);
    if (willBeFree) fd.set("requestFree", "1");

    startTransition(async () => {
      const res = await createMentorshipBooking({ ok: false }, fd);
      if (!res.ok) {
        toast.error(res.message ?? "Could not create booking.");
        return;
      }
      if (res.isFree) {
        toast.success("Free session requested. Your mentor will confirm.");
        setOpen(false);
        reset();
        router.push("/me/sessions");
        return;
      }
      // Razorpay flow
      const ok = await loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        toast.error("Could not load payment gateway. Try again or refresh.");
        return;
      }
      const rp = new window.Razorpay({
        key: res.razorpayKeyId ?? "",
        amount: res.amountMinor!,
        currency: res.currency!,
        order_id: res.razorpayOrderId!,
        name: "eMobility Careers",
        description: `Mentorship with ${props.mentorName}`,
        prefill: { name: props.viewerName, email: props.viewerEmail },
        theme: { color: "#374a47" },
        handler: (response) => {
          const verifyFd = new FormData();
          verifyFd.set("sessionId", res.sessionId!);
          verifyFd.set("razorpayPaymentId", response.razorpay_payment_id);
          verifyFd.set("razorpaySignature", response.razorpay_signature);
          startTransition(async () => {
            const v = await confirmMentorshipPayment({ ok: false }, verifyFd);
            if (v.ok) {
              toast.success("Payment confirmed — session locked.");
              setOpen(false);
              reset();
              router.push("/me/sessions");
            } else {
              toast.error(v.message ?? "Verification failed.");
            }
          });
        },
        modal: {
          ondismiss: () => toast.message("Payment cancelled."),
        },
      });
      rp.open();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} variant="accent" size="lg">
        Book a session
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-emce-lg bg-white shadow-emce-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-emce-border bg-white p-4">
          <h2 className="text-section text-emce-text">Book a session with {props.mentorName}</h2>
          <button type="button" onClick={() => setOpen(false)} className="text-emce-text-sec hover:text-emce-text">✕</button>
        </div>
        <form id={formId} onSubmit={submitBooking} className="space-y-4 p-4">
          <div>
            <Label>Pick a slot (next 14 days, IST)</Label>
            {props.slots.length === 0 ? (
              <p className="mt-2 text-sm text-emce-text-sec">No open slots in the next 14 days. Check back later.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {Object.entries(slotsByDay).map(([day, slots]) => (
                  <div key={day}>
                    <div className="text-xs font-bold uppercase tracking-wide text-emce-text-sec">{day}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {slots.map((s) => {
                        const active = selectedSlot?.start === s.start;
                        return (
                          <button
                            type="button"
                            key={s.start}
                            onClick={() => setSelectedSlot(s)}
                            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                              active
                                ? "border-emce-mid bg-emce-light-soft text-emce-darkest"
                                : "border-emce-border bg-white text-emce-text hover:border-emce-mid"
                            }`}
                          >
                            {new Date(s.start).toLocaleTimeString("en-IN", {
                              timeZone: "Asia/Kolkata",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="duration">Duration</Label>
              <NativeSelect id="duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {props.sessionDurations.map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="mode">Mode</Label>
              <NativeSelect id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="VIDEO">Video call</option>
                <option value="PHONE">Phone</option>
                <option value="CHAT">Chat</option>
              </NativeSelect>
            </div>
          </div>

          <div>
            <Label htmlFor="topic">What do you want to discuss?</Label>
            <Input
              id="topic"
              required
              minLength={10}
              maxLength={500}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Career path into BMS firmware after a degree in EEE"
            />
          </div>
          <div>
            <Label htmlFor="notes">Additional context (optional)</Label>
            <Textarea
              id="notes"
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything specific the mentor should know — links, projects, your CV…"
            />
          </div>

          {props.acceptingFree && props.acceptingPaid && (
            <label className="flex items-start gap-2 text-sm text-emce-text">
              <input
                type="checkbox"
                checked={requestFree}
                onChange={(e) => setRequestFree(e.target.checked)}
                className="mt-0.5"
              />
              <span>Request a free session (mentor's discretion to accept).</span>
            </label>
          )}

          <div className="flex items-center justify-between border-t border-emce-border pt-4">
            <div className="text-sm">
              {willBeFree ? (
                <span className="font-bold text-emce-mid">Free session</span>
              ) : (
                <span className="font-bold">{formatMinor(props.pricePerSessionMinor, props.currency)}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="accent" disabled={pending || !selectedSlot}>
                {pending ? "Booking…" : willBeFree ? "Request session" : "Pay & confirm"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function groupSlotsByDay(slots: Slot[]): Record<string, Slot[]> {
  const out: Record<string, Slot[]> = {};
  for (const s of slots) {
    const day = new Date(s.start).toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    (out[day] ??= []).push(s);
  }
  return out;
}
