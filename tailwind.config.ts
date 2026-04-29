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
          text: "#1e2d2a",
          "text-sec": "#5a6e6a",
          "text-muted": "#8a9e9a",
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
        emce: "0 2px 12px rgba(55, 74, 71, 0.06)",
        "emce-hover": "0 8px 28px rgba(143, 210, 153, 0.12)",
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
