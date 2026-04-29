import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";
import { getPulseCounters } from "@/lib/pulse";

export const runtime = "nodejs";
// Render dynamically so the live counters stay in sync with the
// platform — every WhatsApp / LinkedIn / X unfurl shows the real
// "X open roles, Y companies hiring" snapshot at share-time, not a
// frozen number from build day.
export const dynamic = "force-dynamic";
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
 * one glance, not "this is a job board". Live counters at the bottom
 * (real open-role and company counts pulled at share-time) prove the
 * page is alive without forcing the viewer to click first.
 */
export default async function HomeOG() {
  // Live counters at share-time. We swallow errors so a broken DB
  // never blocks an unfurl — the poster still ships, just without the
  // numbers strip.
  const pulse = await getPulseCounters().catch(() => null);

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
            <span>LIVE · UPDATED DAILY</span>
          </div>
        </div>

        {/* Eyebrow — sets the framing before the H1 lands */}
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
          ✦ The address of EV in India
        </div>

        {/* Hero — the line everyone sees on WhatsApp / LinkedIn first */}
        <div style={{ marginTop: 18, display: "flex" }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
            }}
          >
            Where the EV industry
            <br />
            <span style={{ color: "#c1ffb4" }}>hires, gets hired,</span>
            <br />
            and reads what&apos;s happening.
          </div>
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

        {/* Footer — live counters + URL */}
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
            {pulse && pulse.openJobs > 0 ? (
              <span>
                {pulse.openJobs.toLocaleString()} open roles ·{" "}
                {pulse.activeCompanies.toLocaleString()} companies hiring
                {pulse.verifiedPros > 0 && (
                  <> · {pulse.verifiedPros.toLocaleString()} DIYguru-verified</>
                )}
              </span>
            ) : (
              <span>India&apos;s EV industry · Pulse · Salaries · People · Jobs</span>
            )}
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
