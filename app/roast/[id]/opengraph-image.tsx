import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";
import type { RoastBreakdown } from "@/lib/ai/roast";

export const runtime = "nodejs";
export const alt = "EV Resume Roast — emobility.careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DIM_PRESENTATION: Record<keyof RoastBreakdown, { label: string; emoji: string }> = {
  evDepth: { label: "EV depth", emoji: "🔋" },
  experienceClarity: { label: "Experience", emoji: "📅" },
  projectsImpact: { label: "Project impact", emoji: "🎯" },
  skillsCertifications: { label: "Skills & certs", emoji: "🎓" },
  formatReadability: { label: "Format", emoji: "📐" },
};

/**
 * Roast share preview. The big number is the headline; the per-dim
 * mini-bars give credibility ("this isn't a generic ChatGPT score —
 * here's what it scored on"). The card is intentionally bold so the
 * unfurl in WhatsApp / LinkedIn / X stops the scroll.
 */
export default async function RoastOG({
  params,
}: {
  params: { id: string };
}) {
  const roast = await db.resumeRoast.findUnique({ where: { id: params.id } });
  if (!roast) {
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: "#1e2d2a",
            color: "white",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 60,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
          }}
        >
          EV Resume Roast
        </div>
      ),
      size,
    );
  }
  const breakdown = roast.scoreBreakdown as unknown as RoastBreakdown;

  const tier =
    roast.scoreOverall >= 85 ? { label: "Recruiter-magnet", bg: "#8fd299", fg: "#1e2d2a" }
    : roast.scoreOverall >= 70 ? { label: "Strong", bg: "#c1ffb4", fg: "#1e2d2a" }
    : roast.scoreOverall >= 55 ? { label: "Good baseline", bg: "#fff4eb", fg: "#e8833a" }
    : roast.scoreOverall >= 40 ? { label: "Needs work", bg: "#e8833a", fg: "white" }
    : { label: "Roasted", bg: "#d45454", fg: "white" };

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 56,
          background: "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          flexDirection: "column",
        }}
      >
        {/* Top row: brand wordmark on white pill + LIVE label */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", background: "white", padding: "8px 14px", borderRadius: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brandLogoDataUrl()} alt="eMobility Careers" width={180} height={45} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(193, 255, 180, 0.15)",
              border: "1px solid rgba(193, 255, 180, 0.4)",
              color: "#c1ffb4",
              padding: "8px 18px",
              borderRadius: 999,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            🔥 EV Resume Roast
          </div>
        </div>

        {/* Big score */}
        <div style={{ display: "flex", marginTop: 28, alignItems: "center", gap: 32 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 200, fontWeight: 800, color: "#8fd299", lineHeight: 1, letterSpacing: "-0.04em" }}>
              {roast.scoreOverall}
            </div>
            <div style={{ marginLeft: 12, fontSize: 50, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>
              /100
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "10px 22px",
                borderRadius: 999,
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: tier.bg,
                color: tier.fg,
              }}
            >
              {tier.label}
            </div>
            <div style={{ marginTop: 14, fontSize: 28, fontWeight: 700, lineHeight: 1.2, color: "white" }}>
              EV-industry resume score, scored on six<br />dimensions across India's EV market.
            </div>
          </div>
        </div>

        {/* Per-dim mini-bars */}
        <div style={{ display: "flex", marginTop: 28, gap: 24 }}>
          {(Object.keys(DIM_PRESENTATION) as Array<keyof RoastBreakdown>).map((key) => {
            const score = breakdown[key];
            const meta = DIM_PRESENTATION[key];
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  flex: 1,
                  flexDirection: "column",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.65)" }}>
                  {meta.emoji} {meta.label}
                </span>
                <span
                  style={{
                    marginTop: 6,
                    fontSize: 28,
                    fontWeight: 800,
                    color: score >= 70 ? "#8fd299" : score >= 50 ? "#e8833a" : "#d45454",
                  }}
                >
                  {score}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 22,
            borderTop: "1px solid rgba(255,255,255,0.18)",
            fontSize: 18,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <span>Free, no signup. Get yours in 30 seconds.</span>
          <span style={{ fontWeight: 800, color: "#c1ffb4" }}>
            emobility.careers/roast
          </span>
        </div>
      </div>
    ),
    size,
  );
}
