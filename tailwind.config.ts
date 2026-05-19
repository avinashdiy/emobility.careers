import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./server/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        // Brand palette ported from the existing emobility.careers WordPress plugin
        // (see /tmp/emob-engine-v3/.../public/css/*).
        emce: {
          dark: "#374a47",
          "dark-deep": "#2a3a37",
          darkest: "#1e2d2a",
          mid: "#8fd299",
          "mid-muted": "#6db87a",
          light: "#c1ffb4",
          // Surface tones — chroma deliberately kept low. The previous
          // values (#e8fff3 / #f4fdf6) sat at ~73–89% saturation which
          // forced the eye to keep white-balancing the bg over long
          // reading sessions. These are <15% sat — barely-tinted warm
          // neutrals that still nod to the EV brand without fatiguing.
          // CTAs / badges / hero gradient still use the saturated
          // greens above; the bg just stops competing with them.
          "light-soft": "#eef2eb",   // soft surfaces (banners, hover pills)
          "light-bg": "#f5f6f3",     // page background — LinkedIn-paper neutral
          // Body text colours used to be green-tinted (#1e2d2a etc.) which
          // made paragraphs read "dim" against the greenish background.
          // LinkedIn uses near-neutral darks (rgba(0,0,0,0.9 / 0.6)) so type
          // looks crisp. We match that — accents (logo, buttons, badges,
          // links via emce-dark/mid) stay green; only neutral body / heading /
          // muted text moves to neutral darks.
          text: "#191919",         // ~rgba(0,0,0,0.9) — LinkedIn body
          "text-sec": "#5e676b",   // slightly cool grey — LinkedIn secondary
          // Darkened from #8b95a0 (4.45:1 on white — borderline AA, fails
          // on emce-light-soft) to #6b7480 (5.6:1 on white, 4.7:1 on
          // emce-light-soft) so captions, hints, and timestamps clear
          // WCAG AA across every surface. Kept the hue cool-grey so
          // the system doesn't drift warm in low-emphasis copy.
          "text-muted": "#6b7480",
          border: "#d4e8d8",
          "border-light": "#e8f5eb",
          orange: "#e8833a",
          "orange-light": "#fff4eb",
          // Deep amber for warning-badge text on the orange-light bg
          // (4.65:1 contrast — clears AA). Was inlined as #8a4a1a in
          // badge.tsx; promoted to a token so `text-emce-orange-deep`
          // can be reused consistently across alert / chip surfaces.
          "orange-deep": "#8a4a1a",
          red: "#d45454",
          "red-light": "#fdeaea",
          // Deep red for error-text foreground over `bg-emce-red-light`
          // and over plain white. `text-emce-red` (the base #d45454)
          // hit only 3.4:1 on bg-emce-red-light and 3.98:1 on white —
          // failing WCAG AA for normal text (4.5:1 required). This
          // value clears 6.1:1 on bg-emce-red-light, 8.7:1 on white.
          // Sed-migrated `text-emce-red` → `text-emce-red-deep`
          // sitewide; the base `emce-red` stays for backgrounds,
          // borders, and decorative dots where AA doesn't apply.
          "red-deep": "#a02c2c",
          // Deep success-green text colour — used on the success
          // badge over emce-light-soft (5.1:1 contrast). Promoted
          // from inline `text-[#1e5a32]`.
          "success-deep": "#1e5a32",
          // Verified-badge palette — three values that previously
          // lived as inline hex tuples. Yellow-cream gradient start,
          // amber border, deep amber text.
          "verified-bg": "#fff8e1",
          "verified-border": "#ffe066",
          "verified-text": "#7a5a00",
        },
        // shadcn/ui semantic tokens — driven by CSS vars in globals.css
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // LinkedIn parity pass:
        //   • dashboard (page title) bumped to 22-26px from 18-24px
        //     and weight dropped to 600 — LinkedIn's "Feed" / "My
        //     Network" page titles render at ~26/600.
        //   • section (card title) bumped down to 16px from 17px and
        //     weight dropped to 600 — LinkedIn's card titles are
        //     16/600 ("People you may know", "News", etc.). The
        //     prior 17/700 read as shouty when stacked across 6+
        //     rail widgets.
        //   • badge weight dropped to 600 — LinkedIn's small pills
        //     (skill chips, status badges) use 600 not 700.
        //   • hero / body / hint unchanged — already on the right
        //     side of the LinkedIn benchmark.
        hero: ["clamp(2rem, 5.5vw, 2.625rem)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" }],
        dashboard: ["clamp(1.375rem, 4vw, 1.625rem)", { lineHeight: "1.25", fontWeight: "600" }],
        section: ["1rem", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.6" }],
        hint: ["0.75rem", { lineHeight: "1.5" }],
        badge: ["0.6875rem", { lineHeight: "1.2", fontWeight: "600" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        // LinkedIn parity pass:
        //   • emce: drop the 1px ring at rest (Card already paints a
        //     `border border-emce-border` — the prior ring was
        //     painting a SECOND hairline on top of that real border,
        //     so cards had a doubled edge that read heavier than
        //     LinkedIn's cards. Now: pure 2px diffused lift, very
        //     subtle, plus the real border carries the edge.
        //   • emce-hover keeps the ring + bigger lift — the doubled
        //     edge reads as deliberate elevation on hover, not
        //     accidental weight at rest.
        emce: "0 1px 2px rgba(0, 0, 0, 0.04)",
        "emce-hover": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.06)",
        "emce-lg": "0 0 0 1px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.08)",
        "emce-modal": "0 24px 80px rgba(0, 0, 0, 0.2)",
      },
      backgroundImage: {
        "emce-hero":
          "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
        // Animated multi-stop mesh used by the landing hero and dashboard
        // greeting card. Movement comes from `bg-[length:200%_200%]` +
        // `animate-emce-mesh` which slides the gradient slowly so the
        // surface feels alive without competing with content above it.
        "emce-mesh":
          "radial-gradient(at 12% 18%, rgba(143, 210, 153, 0.35) 0px, transparent 38%), radial-gradient(at 88% 22%, rgba(193, 255, 180, 0.30) 0px, transparent 42%), radial-gradient(at 50% 88%, rgba(61, 94, 88, 0.22) 0px, transparent 50%), linear-gradient(135deg, #1e2d2a 0%, #2a3a37 55%, #3d5e58 100%)",
        "emce-mesh-light":
          "radial-gradient(at 14% 12%, rgba(143, 210, 153, 0.20) 0px, transparent 40%), radial-gradient(at 92% 28%, rgba(193, 255, 180, 0.18) 0px, transparent 45%), radial-gradient(at 48% 94%, rgba(143, 210, 153, 0.12) 0px, transparent 50%), linear-gradient(135deg, #f5f6f3 0%, #eef2eb 100%)",
        // Shimmer sweep for skeletons + premium-badge highlights.
        "emce-shimmer":
          "linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%)",
        // Verified-skill gradient — runs cooler than the DIYguru amber so
        // the two read distinctly when stacked side-by-side on a profile.
        "emce-verified-grad":
          "linear-gradient(135deg, #fff8e1 0%, #ffe066 100%)",
        "emce-diyguru-grad":
          "linear-gradient(135deg, #fff4eb 0%, #e8833a 100%)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // ─── motion primitives ─────────────────────────────────────
        // `fade-up` — entry animation for cards / sections sliding in
        // from below by 8px. Pairs with `motion-reduce:` so users with
        // prefers-reduced-motion get the final state instantly. The
        // 4–8px translate is deliberately small — bigger movement reads
        // as "this is loading" rather than "this is arriving".
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        // Slow background-position cycle for animated mesh gradients.
        "mesh-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        // Skeleton shimmer — replaces Tailwind's `animate-pulse` which
        // just toggles opacity. A sweeping gradient reads as "content
        // streaming in" rather than "this element is broken".
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Soft ping for "new notification" / "live update" dots — half
        // the alpha of Tailwind's default `animate-ping` so it doesn't
        // strobe-flash next to dense type.
        "ping-soft": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "75%, 100%": { transform: "scale(1.8)", opacity: "0" },
        },
        // Single-shot sparkle — used by the verified-badge reveal and
        // the "first application submitted" confetti animation. 600ms
        // because anything longer overstays its welcome on every render.
        "sparkle": {
          "0%, 100%": { transform: "scale(1) rotate(0deg)", opacity: "0" },
          "30%, 60%": { transform: "scale(1) rotate(180deg)", opacity: "1" },
        },
        // Press feedback — paired with `active:animate-press` on
        // interactive buttons. Tiny scale-down on click that reads as
        // "I felt that" without slowing the action perceptibly.
        "press": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(0.97)" },
          "100%": { transform: "scale(1)" },
        },
        // Floating motion for hero illustration accents (orbs, dots).
        "float": {
          "0%, 100%": { transform: "translateY(0) translateX(0)" },
          "50%": { transform: "translateY(-6px) translateX(2px)" },
        },
        // Subtle pulsing ring around live counters / open-to-work avatar.
        "ring-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(143, 210, 153, 0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(143, 210, 153, 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.5s cubic-bezier(0.21, 1.02, 0.73, 1) both",
        "fade-up-fast": "fade-up 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) both",
        "fade-in": "fade-in 0.4s ease-out both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) both",
        // 18s mesh cycle — slow enough that the eye registers warmth
        // rather than motion. Anything under ~12s starts to feel busy.
        "emce-mesh": "mesh-shift 18s ease-in-out infinite",
        // 1.6s shimmer matches what GitHub and Linear use for skeletons.
        "shimmer": "shimmer 1.8s ease-in-out infinite",
        "ping-soft": "ping-soft 1.6s cubic-bezier(0, 0, 0.2, 1) infinite",
        "sparkle": "sparkle 0.6s ease-in-out",
        "press": "press 0.18s ease-out",
        "float": "float 4s ease-in-out infinite",
        "ring-pulse": "ring-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
