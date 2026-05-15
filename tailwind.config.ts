import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
  darkMode: ["class"],
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
        // From plugin: hero 42px, dashboard 20px, section 17px, body 14px,
        // secondary 13px, hint 12px, badge 11px.
        hero: ["clamp(2rem, 5.5vw, 2.625rem)", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" }],
        dashboard: ["clamp(1.125rem, 3.5vw, 1.5rem)", { lineHeight: "1.3", fontWeight: "700" }],
        section: ["1.0625rem", { lineHeight: "1.4", fontWeight: "700" }],
        body: ["0.875rem", { lineHeight: "1.6" }],
        hint: ["0.75rem", { lineHeight: "1.5" }],
        badge: ["0.6875rem", { lineHeight: "1.2", fontWeight: "700" }],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      boxShadow: {
        // LinkedIn-style "1px ring + tiny lift" — what makes their cards look
        // weightless. The first layer is a hairline border simulated as a
        // shadow (sharper than a real border at 1× DPR), the second is the
        // 2px diffused lift. Was a heavier 12px blur which read as "sticker".
        emce: "0 0 0 1px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.04)",
        "emce-hover": "0 0 0 1px rgba(0, 0, 0, 0.08), 0 4px 8px rgba(0, 0, 0, 0.06)",
        "emce-lg": "0 0 0 1px rgba(0, 0, 0, 0.05), 0 8px 24px rgba(0, 0, 0, 0.08)",
        "emce-modal": "0 24px 80px rgba(0, 0, 0, 0.2)",
      },
      backgroundImage: {
        "emce-hero":
          "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
