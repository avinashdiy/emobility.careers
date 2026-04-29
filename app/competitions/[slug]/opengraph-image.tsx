import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";

export const runtime = "nodejs";
export const alt = "Competition on eMobility Careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Competition share card. Shows host + title + dates + prize pool, plus a
 * "Register on emobility.careers →" CTA. Renders for LIVE / JUDGING /
 * RESULTS competitions; drafts and pending-review fall back to the brand
 * card so we don't leak draft titles.
 */
export default async function OG({ params }: { params: { slug: string } }) {
  const c = await db.competition.findFirst({
    where: {
      slug: params.slug,
      status: { in: ["LIVE", "JUDGING", "RESULTS"] },
    },
    include: {
      hostCompany: { select: { name: true, logoUrl: true } },
      _count: { select: { registrations: true } },
    },
  });

  if (!c) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#1e2d2a", color: "#c1ffb4", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 800 }}>
          eMobility Careers
        </div>
      ),
      size,
    );
  }

  const prize =
    c.totalPrizePoolMinor > 0
      ? new Intl.NumberFormat("en-IN", { style: "currency", currency: c.prizeCurrency, maximumFractionDigits: 0 }).format(c.totalPrizePoolMinor / 100)
      : null;

  const STATUS_BADGE: Record<string, { text: string; bg: string; color: string }> = {
    LIVE: { text: "● LIVE", bg: "#dc2626", color: "#fff" },
    JUDGING: { text: "JUDGING", bg: "#f59e0b", color: "#1e2d2a" },
    RESULTS: { text: "RESULTS", bg: "#8fd299", color: "#1e2d2a" },
  };
  const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.LIVE;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          padding: 64,
          background: "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Status badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: badge.bg, color: badge.color, padding: "6px 14px", borderRadius: 6, fontWeight: 800, fontSize: 18, letterSpacing: "0.05em" }}>
            {badge.text}
          </div>
          <div style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", padding: "6px 14px", borderRadius: 999, fontSize: 18, fontWeight: 600 }}>
            {c.type.replace("_", " ")}
          </div>
        </div>

        {/* Host strip */}
        <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 14 }}>
          {c.hostCompany.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.hostCompany.logoUrl}
              alt={c.hostCompany.name}
              width={48}
              height={48}
              style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", background: "white" }}
            />
          ) : (
            <div style={{ display: "flex", width: 48, height: 48, borderRadius: 8, background: "#8fd299", color: "#1e2d2a", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800 }}>
              {c.hostCompany.name[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>Hosted by</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{c.hostCompany.name}</div>
          </div>
        </div>

        {/* Title */}
        <div style={{ marginTop: 24, display: "flex" }}>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            {c.title.length > 70 ? c.title.slice(0, 70) + "…" : c.title}
          </div>
        </div>

        {/* Pills row */}
        <div style={{ marginTop: 24, display: "flex", flexWrap: "wrap", gap: 10, fontSize: 20 }}>
          {prize && (
            <span style={{ background: "#8fd299", color: "#1e2d2a", padding: "8px 18px", borderRadius: 999, fontWeight: 800 }}>
              🏆 {prize} prize pool
            </span>
          )}
          <span style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)", padding: "8px 18px", borderRadius: 999 }}>
            {c._count.registrations} registered
          </span>
          {c.isTeamBased && (
            <span style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.9)", padding: "8px 18px", borderRadius: 999 }}>
              Teams of {c.minTeamSize ?? "?"}–{c.maxTeamSize ?? "?"}
            </span>
          )}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          {/* Brand wordmark on a white pill — readable on the dark gradient. */}
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: "white", padding: "8px 12px", borderRadius: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandLogoDataUrl()} alt="eMobility Careers" width={160} height={40} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#8fd299", color: "#1e2d2a", padding: "12px 22px", borderRadius: 999, fontSize: 22, fontWeight: 800 }}>
            <span>{c.status === "RESULTS" ? "View results" : "Register now"}</span>
            <span>→</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
