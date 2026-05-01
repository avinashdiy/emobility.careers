"use client";

import { useEffect, useState } from "react";
import { Megaphone, X, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

const TONE_CLASS: Record<string, string> = {
  CRITICAL: "bg-emce-red text-white border-b border-emce-red",
  WARNING: "bg-emce-orange text-white border-b border-emce-orange",
  SUCCESS: "bg-emce-mid text-white border-b border-emce-mid",
  INFO: "bg-emce-light-soft text-emce-text border-b border-emce-border",
};

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CRITICAL: AlertTriangle,
  WARNING: AlertTriangle,
  SUCCESS: CheckCircle2,
  INFO: Info,
};

export function AnnouncementBannerClient(props: {
  id: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  dismissible: boolean;
}) {
  // localStorage-backed dismissal per announcement id. Critical
  // banners ignore the dismissed state — admin set dismissible=false
  // for things the user can't safely miss (maintenance, security
  // outage, regulatory disclosure). Lazily check so SSR doesn't see
  // any localStorage value.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!props.dismissible) return;
    try {
      if (window.localStorage.getItem(`emce_anno_dismissed_${props.id}`)) {
        setDismissed(true);
      }
    } catch {
      /* localStorage unavailable — render the banner once per session */
    }
  }, [props.id, props.dismissible]);

  if (dismissed) return null;

  const Icon = ICON[props.severity] ?? Megaphone;
  const tone = TONE_CLASS[props.severity] ?? TONE_CLASS.INFO;

  return (
    <div role="status" aria-live="polite" className={`flex items-center gap-3 px-4 py-2 text-sm ${tone}`}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <strong>{props.title}</strong>
        <span className="ml-2 text-current/80">{props.body}</span>
        {props.ctaLabel && props.ctaUrl && (
          <a
            href={props.ctaUrl}
            target={/^https?:/.test(props.ctaUrl) ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="ml-3 inline-block rounded-md bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30"
          >
            {props.ctaLabel} →
          </a>
        )}
      </div>
      {props.dismissible && (
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={() => {
            try {
              window.localStorage.setItem(
                `emce_anno_dismissed_${props.id}`,
                String(Date.now()),
              );
            } catch {
              /* localStorage unavailable */
            }
            setDismissed(true);
          }}
          className="shrink-0 rounded p-1 hover:bg-black/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
