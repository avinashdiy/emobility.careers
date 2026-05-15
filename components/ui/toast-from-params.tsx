"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { Confetti } from "@/components/ui/confetti";

/**
 * Reads `?notice=...` and `?error=...` from the URL on mount and fires
 * a toast, then strips the param from the URL so a refresh doesn't
 * re-toast.
 *
 * Drop one instance into a layout or page and server actions can
 * simply `redirect("...?notice=Saved")` for feedback without wiring
 * useFormState.
 *
 * Vibe pass: notices that match `CONFETTI_TRIGGERS` *also* fire a
 * one-shot brand-coloured confetti burst. The toast stays a toast;
 * confetti is purely additive. Used for the few moments worth
 * celebrating — first application sent, job published, verification
 * approved, badge unlocked.
 */
const CONFETTI_TRIGGERS: RegExp[] = [
  /^Application submitted/i,
  /^Job (posted|published)/i,
  /verified/i,
  /Welcome to /i,
  /^You're hired/i,
  /badge unlocked/i,
];

export function ToastFromSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    const notice = sp.get("notice");
    const error = sp.get("error");
    if (!notice && !error) return;
    if (notice) {
      toast.success(notice);
      if (CONFETTI_TRIGGERS.some((re) => re.test(notice))) {
        setConfetti(true);
      }
    }
    if (error) toast.error(error);
    const next = new URLSearchParams(sp.toString());
    next.delete("notice");
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return confetti ? <Confetti onComplete={() => setConfetti(false)} /> : null;
}
