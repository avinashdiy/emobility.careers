import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";

export const runtime = "nodejs";
// Cache for an hour — long enough that WhatsApp / LinkedIn / X
// crawlers get the same image on every fetch within a popular share
// burst, short enough that we can ship a new poster within the day
// without forcing a redeploy. (We removed the per-request DB call
// that was making this image slow + flaky on share-time. Slow
// renders are why some unfurls fell back to the favicon.)
export const revalidate = 3600;
export const alt = "The address of EV in India — emobility.careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default Open Graph image — the share-card every link unfurl resolves
 * to when emobility.careers is posted on WhatsApp, LinkedIn, X, etc.
 *
 * The card is poster-style on purpose — it's the first impression of
 * the platform for anyone who didn't seek it out, and it has to
 * communicate "this is the address of the EV industry in India" in
 * one glance, not "this is a job board". Every element here is
 * static so the image renders fast and never fails — WhatsApp's
 * crawler has aggressive timeouts and falls back to the favicon if
 * the image is slow, which is why the previous DB-backed live-counters
 * version sometimes showed a tiny icon instead of the poster.
 */
export default async function HomeOG() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 64,
          background:
            "linear-gradient(155deg, #0e1a17 0%, #1e2d2a 38%, #2f4843 70%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top row — wordmark + "live" pill on the right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", background: "white", padding: "12px 18px", borderRadius: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoDataUrl()} alt="eMobility Careers" width={224} height={56} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              border: "1px solid rgba(193, 255, 180, 0.4)",
              background: "rgba(193, 255, 180, 0.12)",
              color: "#c1ffb4",
              padding: "10px 16px",
              borderRadius: 999,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.05em",
            }}
          >
            <span
              style={{
                display: "flex",
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "#8fd299",
              }}
            />
            <span>UPDATED DAILY</span>
          </div>
        </div>

        {/* Eyebrow — sets the framing before the H1 lands. The
            leading "⚡" reuses our brand glyph (also covered by the
            standard system font) — earlier we tried "✦" but Satori
            couldn't resolve a font for that codepoint and the whole
            image render failed. */}
        <div
          style={{
            marginTop: 56,
            display: "flex",
            color: "#8fd299",
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          ⚡ The address of EV in India
        </div>

        {/* Hero — the line everyone sees on WhatsApp / LinkedIn first.
            Multi-line text is broken into explicit flex-column children
            instead of <br>; Satori requires every parent with more
            than one child to set display:flex (or none) explicitly. */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            flexDirection: "column",
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ display: "flex" }}>Where the EV industry</span>
          <span style={{ display: "flex", color: "#c1ffb4" }}>hires, gets hired,</span>
          <span style={{ display: "flex" }}>and reads what&apos;s happening.</span>
        </div>

        {/* What's-here strip — chips spelling out the four lenses */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {["Jobs", "Salaries", "Companies", "People", "Industry Pulse"].map((s) => (
            <span
              key={s}
              style={{
                background: "rgba(255,255,255,0.1)",
                padding: "10px 22px",
                borderRadius: 999,
                fontSize: 22,
                fontWeight: 600,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {s}
            </span>
          ))}
        </div>

        {/* Footer — static line + URL. Live counters were nice but
            broke unfurls on slow DB connections; better to ship a
            fast, reliable poster every time. */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.78)" }}>
            India&apos;s EV industry · Hiring · Salaries · People · Pulse
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#c1ffb4" }}>
            emobility.careers
          </div>
        </div>
      </div>
    ),
    size,
  );
}
