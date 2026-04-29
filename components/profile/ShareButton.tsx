"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (!nav) return;
      // Web Share API on mobile, clipboard fallback elsewhere.
      // Cast since the Web Share API isn't in the default lib.dom types.
      const navWithShare = nav as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (typeof navWithShare.share === "function") {
        await navWithShare.share({ url, title: "eMobility Careers profile" });
        return;
      }
      await nav.clipboard.writeText(url);
      setCopied(true);
      toast.success("Profile link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // user cancelled share — no-op
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={share}>
      {copied ? "Copied ✓" : "Share profile"}
    </Button>
  );
}
