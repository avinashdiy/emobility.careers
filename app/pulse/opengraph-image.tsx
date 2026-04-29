import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";
import { getPulseCounters } from "@/lib/pulse";

export const runtime = "nodejs";
// Force per-request rendering so the share preview always reflects
// today's live counters — that's the whole point of Pulse virality.
export const dynamic = "force-dynamic";
export const alt = "EV Industry Pulse — live heartbeat of India's EV careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Pulse share preview. Designed to make a WhatsApp / LinkedIn /
 * X unfurl read as a live dashboard — bold counters that say "this
 * platform has a pulse". Same hero gradient as the page so the share
 * card and the destination feel like the same artefact.
 */
export default async function PulseOG() {
  const counters = await getPulseCounters().catch(() => ({
    openJobs: 0, jobsAddedToday: 0, verifiedPros: 0, hiresLast7d: 0, activeCompanies: 0,
  }));
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 60,
          background: "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          flexDirection: "column",
        }}
      >
        {/* Brand wordmark on a white pill (the brand mark is dark-on-
            transparent so it needs the pill to stay legible on the
            dark hero gradient). */}
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", background: "white", padding: "10px 14px", borderRadius: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoDataUrl()} alt="eMobility Careers" width={200} height={50} />
          </div>
        </div>

        {/* "LIVE" pulse dot */}
        <div style={{ display: "flex", marginTop: 36, alignItems: "center", gap: 12 }}>
          <div style={{ width: 16, height: 16, borderRadius: 999, background: "#8fd299", boxShadow: "0 0 18px #8fd299" }} />
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "0.08em", color: "#c1ffb4" }}>
            LIVE · EV INDUSTRY PULSE
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", marginTop: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em", maxWidth: 1080 }}>
            The live heartbeat of India's<br />
            <span style={{ color: "#8fd299" }}>EV industry.</span>
          </div>
        </div>

        {/* Counter strip */}
        <div style={{ marginTop: "auto", display: "flex", gap: 36 }}>
          <Counter label="Open EV jobs" value={counters.openJobs} accent />
          <Counter label="Added today" value={counters.jobsAddedToday} />
          <Counter label="Verified pros" value={counters.verifiedPros} />
          <Counter label="Hires this week" value={counters.hiresLast7d} accent />
        </div>

        {/* Footer URL */}
        <div
          style={{
            marginTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 22,
            borderTop: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>
            Where the EV industry hires, gets hired, and trades notes.
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#c1ffb4" }}>
            emobility.careers/pulse
          </div>
        </div>
      </div>
    ),
    size,
  );
}

function Counter({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1,
          color: accent ? "#8fd299" : "white",
        }}
      >
        {value.toLocaleString()}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.7)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
