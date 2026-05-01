"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { requestPhoneOtp, verifyPhoneOtp } from "@/server/auth/phone-actions";

interface Props {
  /** User.phone — last value the user typed. */
  initialPhone: string | null;
  /** True when User.phoneVerifiedAt is set. */
  verified: boolean;
}

/**
 * Two-step phone verification UI. Renders inside HeaderEditor so the
 * "Verify your phone number" link from the profile-completeness card
 * lands somewhere with an actual action button.
 *
 *   Step 1 — user types phone, clicks "Send code". Server sends an
 *   SMS via MSG91 and stamps the phone column (without setting the
 *   verified-at timestamp). UI flips to the OTP input.
 *
 *   Step 2 — user types the 6-digit code, clicks "Verify". Server
 *   compares against Redis, stamps phoneVerifiedAt, returns ok.
 *
 * If the user is already verified we just render a green badge with
 * the masked number — no form to muck with.
 */
export function PhoneVerifier({ initialPhone, verified }: Props) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(verified);

  if (done) {
    const masked = (initialPhone ?? phone).replace(/(\+?\d{2,3})\d+(\d{4})/, "$1******$2");
    return (
      <div className="rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emce-mid-muted" />
          <span className="font-bold text-emce-text">Phone verified</span>
          <Badge variant="success" className="text-[10px]">✓</Badge>
        </div>
        <p className="mt-1 text-hint text-emce-text-sec">
          {masked || initialPhone || "Number on file"} — confirmed by SMS.
        </p>
      </div>
    );
  }

  function send() {
    if (!phone.trim()) {
      toast.error("Enter your phone number first.");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("phone", phone.trim());
      const r = await requestPhoneOtp(fd);
      if (r.ok) {
        toast.success(r.message ?? "Code sent.");
        setStage("code");
      } else {
        toast.error(r.message ?? "Couldn't send code.");
      }
    });
  }

  function verify() {
    if (code.length !== 6) {
      toast.error("Enter the 6-digit code.");
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("code", code.trim());
      const r = await verifyPhoneOtp(fd);
      if (r.ok) {
        toast.success("Phone verified.");
        setDone(true);
      } else {
        toast.error(r.message ?? "Couldn't verify.");
      }
    });
  }

  return (
    <div className="rounded-md border border-emce-border bg-white p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emce-text-sec" />
        <span className="text-sm font-bold text-emce-text">Verify your phone</span>
        <Badge variant="outline" className="ml-auto text-[10px]">+6% completeness</Badge>
      </div>
      <p className="mt-1 text-hint text-emce-text-sec">
        Verified phone numbers can apply faster, get OTP-based recovery, and unlock
        WhatsApp digest.
      </p>

      {stage === "phone" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="ph">Phone (with country code)</Label>
            <Input
              id="ph"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 9876543210"
              required
            />
          </div>
          <Button type="button" onClick={send} disabled={pending}>
            {pending ? "Sending…" : "Send code"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="otp">6-digit code from SMS to {phone}</Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="font-mono tracking-widest"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStage("phone")}
              disabled={pending}
            >
              Change number
            </Button>
            <Button type="button" onClick={verify} disabled={pending}>
              {pending ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
