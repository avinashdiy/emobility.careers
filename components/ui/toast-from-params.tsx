"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

/**
 * Reads `?notice=...` and `?error=...` from the URL on mount and fires a toast,
 * then strips the param from the URL so a refresh doesn't re-toast.
 *
 * Drop one instance into a layout or page and server actions can simply
 * `redirect("...?notice=Saved")` for feedback without wiring useFormState.
 */
export function ToastFromSearchParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    const notice = sp.get("notice");
    const error = sp.get("error");
    if (!notice && !error) return;
    if (notice) toast.success(notice);
    if (error) toast.error(error);
    const next = new URLSearchParams(sp.toString());
    next.delete("notice");
    next.delete("error");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
