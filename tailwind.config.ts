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
          "light-soft": "#e8fff3",
          "light-bg": "#f4fdf6",
          // Body text colours used to be green-tinted (#1e2d2a etc.) which
          // made paragraphs read "dim" against the greenish background.
          // LinkedIn uses near-neutral darks (rgba(0,0,0,0.9 / 0.6)) so type
          // looks crisp. We match that — accents (logo, buttons, badges,
          // links via emce-dark/mid) stay green; only neutral body / heading /
          // muted text moves to neutral darks.
          text: "#191919",         // ~rgba(0,0,0,0.9) — LinkedIn body
          "text-sec": "#5e676b",   // slightly cool grey — LinkedIn secondary
          "text-muted": "#8b95a0", // captions / timestamps
          border: "#d4e8d8",
          "border-light": "#e8f5eb",
          orange: "#e8833a",
          "orange-light": "#fff4eb",
          red: "#d45454",
          "red-light": "#fdeaea",
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
