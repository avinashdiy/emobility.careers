"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Theme toggle — UI/UX V2 (#1 dark mode).
 *
 * Three states cycled by a single button: `light` → `dark` → `system`.
 * Persisted in localStorage under `emce-theme`. The actual class swap
 * (`<html class="dark">`) is done in two places:
 *
 *   1. The inline boot script in app/layout.tsx (synchronous, FOUC-free)
 *      runs BEFORE React hydrates and applies the saved choice — without
 *      this, every reload would flash light theme on dark-mode users.
 *   2. This component reapplies on user toggle + listens to OS-level
 *      `prefers-color-scheme` changes when mode === "system".
 *
 * The toggle itself is icon-only; the visible icon reflects the *current*
 * resolved theme, the tooltip text reflects the user's chosen *mode*.
 */

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "emce-theme";

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function applyThemeClass(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  // Update the meta theme-color so the iOS status-bar tint tracks the
  // active theme (light: paper cream, dark: deep teal).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#1e2d2a" : "#f5f6f3");
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  // Boot from `system` so SSR markup matches first paint. Then in the
  // first effect we read the stored value (which the inline script
  // already applied to <html>) so the button label is correct.
  const [mode, setMode] = React.useState<ThemeMode>("system");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMode(readStoredMode());
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const resolved = mode === "system" ? resolveSystemTheme() : mode;
    applyThemeClass(resolved);
    if (mode === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  }, [mode, mounted]);

  // When the user is on system, follow live OS changes (dark/light
  // schedule, manual flip from the OS-level toggle).
  React.useEffect(() => {
    if (!mounted || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeClass(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode, mounted]);

  const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const label =
    mode === "light" ? "Light theme — tap for dark" :
    mode === "dark" ? "Dark theme — tap for system" :
    "System theme — tap for light";

  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-emce-border bg-white text-emce-text-sec transition-colors hover:bg-emce-light-soft hover:text-emce-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-secondary",
        className,
      )}
      // Suppress hydration mismatch on the icon swap. The inline boot
      // script may already have flipped <html> to dark before React
      // hydrates; without this, React would whine about the icon
      // attribute difference between SSR (assumed light) and client.
      suppressHydrationWarning
    >
      {/* Visible icon flips with mode (sun / moon / monitor). All three
          sit in the same 16x16 box for layout-stable swapping. */}
      <ThemeIcon mode={mounted ? mode : "system"} />
    </button>
  );
}

function ThemeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/**
 * Inline script — runs synchronously before React hydration. Reads
 * localStorage + system pref and applies the `dark` class to <html>
 * so the first paint matches the user's preference. Without this,
 * dark-mode users see a 200ms flash of light bg on every navigation.
 *
 * Kept as a tiny self-contained string so it can be dropped straight
 * into a `<script dangerouslySetInnerHTML>` in the root layout.
 */
export const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var saved = localStorage.getItem('emce-theme');
    var sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = saved === 'dark' || saved === 'light' ? saved : (sys ? 'dark' : 'light');
    if (resolved === 'dark') document.documentElement.classList.add('dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#1e2d2a' : '#f5f6f3');
  } catch (e) { /* localStorage blocked — defaults to light */ }
})();
`;
