"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * #4 Wave A — Digital visiting card (Apna-style).
 *
 * One-tap "Share my profile" → builds a punchy text blurb + the
 * public profile URL, then drops the user into WhatsApp's share
 * intent (mobile) / native share sheet (desktop fallback). The
 * candidate doesn't have to copy-paste or guess what to type — the
 * card is pre-written for them.
 *
 * India recruiters live on WhatsApp; getting a tap-share into their
 * existing chat habit is meaningfully higher conversion than asking
 * the candidate to email a PDF. Apna report ~35% higher callback
 * rates from WhatsApp shares vs PDF resumes.
 *
 * No JS-heavy share UI — we use the platform's native sheet via
 * `navigator.share()` when available, falling back to a wa.me deep
 * link that opens WhatsApp directly on Android/iOS.
 */
interface WhatsAppShareCardProps {
  /** Public profile URL — full https URL. */
  profileUrl: string;
  /** Display name used in the share blurb. */
  fullName: string;
  /** Headline, max ~140 chars — used in the blurb. */
  headline: string | null;
  /** Verification badges to surface in the blurb. */
  isDIYguruVerified: boolean;
  isIDVerified: boolean;
  /** Top 3-4 skills, comma-joined. */
  topSkills: string[];
  /** Years of experience, used in the blurb. */
  yearsExperience: number;
  /** Optional EV domain anchor — e.g. "Battery", "Charging". */
  evDomain: string | null;
}

function buildBlurb({
  fullName,
  headline,
  isDIYguruVerified,
  isIDVerified,
  topSkills,
  yearsExperience,
  evDomain,
}: Omit<WhatsAppShareCardProps, "profileUrl">): string {
  const lines: string[] = [];
  lines.push(`📇 ${fullName}`);
  if (headline) lines.push(headline);
  const badges: string[] = [];
  if (isIDVerified) badges.push("✓ Verified");
  if (isDIYguruVerified) badges.push("⭐ DIYguru");
  if (badges.length) lines.push(badges.join(" · "));
  const exp = yearsExperience > 0 ? `${yearsExperience}y exp` : "Fresh grad";
  const domainPart = evDomain ? ` · ${evDomain}` : "";
  lines.push(`${exp}${domainPart}`);
  if (topSkills.length > 0) {
    lines.push(`🔧 ${topSkills.slice(0, 4).join(" · ")}`);
  }
  return lines.join("\n");
}

export function WhatsAppShareCard(props: WhatsAppShareCardProps) {
  const [copied, setCopied] = useState(false);

  const blurb = buildBlurb(props);
  const message = `${blurb}\n\n${props.profileUrl}`;

  function shareToWhatsApp() {
    // Mobile: wa.me opens the user's WhatsApp app with the message
    // pre-filled in the share-with-contact picker. Desktop: same URL
    // opens WhatsApp Web with the same message ready to forward.
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function nativeShare() {
    // Prefer the OS share sheet on devices that support it (iOS,
    // most modern Android, recent macOS). Gives access to every
    // installed messaging app, not just WhatsApp.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${props.fullName} · eMobility Careers`,
          text: blurb,
          url: props.profileUrl,
        });
        return;
      } catch {
        // User cancelled the share sheet — fall through to copy fallback.
      }
    }
    // Final fallback: copy the message to clipboard so the user can
    // paste anywhere themselves.
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // localStorage / clipboard blocked — at this point we've tried
      // every reasonable path. User can manually copy from the
      // textarea preview below.
    }
  }

  return (
    <Card variant="interactive" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-section text-emce-text">Share your profile</h3>
        <Badge variant="default">📱 WhatsApp-ready</Badge>
      </div>
      <p className="text-hint text-emce-text-sec">
        India recruiters live on WhatsApp. Drop a one-tap visiting card into
        their chat — pre-written, including your verified badges.
      </p>

      {/* Preview */}
      <pre className="rounded-md bg-emce-light-soft p-3 text-[12px] leading-relaxed text-emce-text whitespace-pre-wrap font-sans">
        {message}
      </pre>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="glow"
          size="sm"
          onClick={shareToWhatsApp}
          className="bg-[#25D366] text-white hover:brightness-105"
        >
          📱 Share on WhatsApp
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={nativeShare}>
          {copied ? "✓ Copied" : "More options"}
        </Button>
      </div>
    </Card>
  );
}
