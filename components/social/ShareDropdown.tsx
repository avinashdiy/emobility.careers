"use client";

import { useEffect, useRef, useState } from "react";
import {
  Share2,
  Linkedin,
  Twitter,
  Facebook,
  MessageCircle,
  Mail,
  Copy,
  Send,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** The URL to share. Absolute (https://…) or path-relative (/...) — relative
      paths are resolved against window.location.origin at click time. */
  url: string;
  /** Used as title / tweet text / share preview. Keep under 100 chars. */
  title: string;
  /** Optional longer text used by Email / WhatsApp share. */
  description?: string;
  /** Display label for the trigger. Defaults to "Share". */
  label?: string;
  /** Visual variant: `button` for full Button-style trigger, `icon` for
      icon-only chip. Defaults to `button`. */
  variant?: "button" | "icon";
  /** Optional extra class on the trigger. */
  className?: string;
}

/**
 * Reusable share affordance with a platform-icon row, used on candidate
 * profiles, job pages, event pages, and (via SharePostMenu) feed posts.
 *
 *   [Share ▾] → opens a popover with: LinkedIn · X · Facebook · WhatsApp ·
 *               Email · Copy link · (native share on mobile)
 *
 * Each icon opens the platform's share-intent URL in a new tab. Native
 * Share API is offered as a fallback on mobile so users hit their OS
 * share sheet (Telegram, Instagram DMs, native message apps, etc.).
 *
 * No tracking pixels, no third-party JS — every share is a plain
 * window-open or fetch-free intent URL. The platforms themselves
 * resolve the link preview from our existing OG meta tags.
 */
export function ShareDropdown({
  url,
  title,
  description,
  label = "Share",
  variant = "button",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Resolve an absolute URL at click time. SSR doesn't have window, but
  // the popover only renders post-mount via useState so this is safe.
  const fullUrl = url.startsWith("http")
    ? url
    : typeof window !== "undefined"
      ? `${window.location.origin}${url}`
      : url;

  const encUrl = encodeURIComponent(fullUrl);
  const encTitle = encodeURIComponent(title);
  const encBody = encodeURIComponent(description ?? title);

  const intents = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`,
    twitter: `https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
    whatsapp: `https://wa.me/?text=${encTitle}%0A${encUrl}`,
    email: `mailto:?subject=${encTitle}&body=${encBody}%0A%0A${encUrl}`,
  };

  function copyLink() {
    navigator.clipboard.writeText(fullUrl).then(
      () => {
        setCopied(true);
        toast.success("Link copied");
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Couldn't copy. Long-press to copy manually."),
    );
  }

  function nativeShare() {
    type ShareNav = Navigator & { share?: (data: ShareData) => Promise<void> };
    const nav = (typeof navigator !== "undefined" ? (navigator as ShareNav) : null);
    if (nav?.share) {
      nav.share({ title, url: fullUrl, text: description }).catch(() => undefined);
      setOpen(false);
    } else {
      copyLink();
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emce-border bg-white px-3 text-xs font-bold text-emce-text hover:bg-emce-light-soft"
        >
          <Share2 className="h-3.5 w-3.5" />
          {label}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={label}
          className="grid h-9 w-9 place-items-center rounded-md text-emce-text-sec hover:bg-emce-light-soft hover:text-emce-text"
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-md border border-emce-border bg-white shadow-emce-lg"
        >
          <div className="grid grid-cols-3 gap-1 p-2">
            <Tile
              href={intents.linkedin}
              onClick={() => setOpen(false)}
              icon={<Linkedin className="h-5 w-5" />}
              label="LinkedIn"
              tone="text-[#0a66c2]"
            />
            <Tile
              href={intents.twitter}
              onClick={() => setOpen(false)}
              icon={<Twitter className="h-5 w-5" />}
              label="X"
              tone="text-emce-text"
            />
            <Tile
              href={intents.facebook}
              onClick={() => setOpen(false)}
              icon={<Facebook className="h-5 w-5" />}
              label="Facebook"
              tone="text-[#1877f2]"
            />
            <Tile
              href={intents.whatsapp}
              onClick={() => setOpen(false)}
              icon={<MessageCircle className="h-5 w-5" />}
              label="WhatsApp"
              tone="text-[#25d366]"
            />
            <Tile
              href={intents.email}
              onClick={() => setOpen(false)}
              icon={<Mail className="h-5 w-5" />}
              label="Email"
              tone="text-emce-text-sec"
            />
            <Tile
              onClick={nativeShare}
              icon={<Send className="h-5 w-5" />}
              label="More"
              tone="text-emce-text-sec"
            />
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center justify-center gap-2 border-t border-emce-border bg-emce-light-bg px-3 py-2 text-xs font-bold text-emce-text-sec hover:text-emce-text"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emce-mid-muted" /> Link copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy link
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * One platform tile in the share grid. Renders as an anchor when
 * `href` is supplied (opens in a new tab with rel=noopener) or a
 * button when `onClick` is given (used by the native-share fallback).
 */
function Tile({
  href,
  onClick,
  icon,
  label,
  tone,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  tone: string;
}) {
  const className = `flex flex-col items-center gap-1 rounded-md p-2 text-[10px] font-semibold text-emce-text-sec hover:bg-emce-light-soft ${tone}`;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
      >
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
