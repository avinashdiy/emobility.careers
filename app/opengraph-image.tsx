import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
// Render dynamically — DB-backed getSettings() can't reach a DB during build,
// so SSG would fall back to defaults. Per-request rendering keeps the image
// in sync with whatever admins edit in /admin/settings.
export const dynamic = "force-dynamic";
export const alt = "eMobility Careers — India's #1 EV-only career platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default Open Graph image rendered for the home page (and any route that
 * doesn't have its own `opengraph-image.tsx`). Used by WhatsApp, LinkedIn,
 * X/Twitter, and every other unfurler when the site URL is shared.
 *
 * Site name + tagline are admin-editable via /admin/settings — read here so
 * the share preview stays in sync without a redeploy.
 */
export default async function HomeOG() {
  // Read the admin-set identity. Cached for ~30s in lib/settings, so even
  // sharing a few URLs in quick succession only hits the DB once.
  const s = await getSettings("site.name", "site.tagline").catch(() => ({} as Record<string, string>));
  const siteName = s["site.name"] || "eMobility Careers";
  const tagline = s["site.tagline"] || "EV careers, supercharged.";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: 64,
          background: "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
          flexDirection: "column",
        }}
      >
        {/* Header — logo + brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ background: "#8fd299", color: "#1e2d2a", padding: "10px 14px", borderRadius: 12, fontWeight: 800, fontSize: 28 }}>eM</div>
          <div style={{ fontWeight: 800, fontSize: 32 }}>
            eMobility<span style={{ color: "#8fd299" }}>.careers</span>
          </div>
        </div>

        {/* Pill — "India's #1 EV-only career platform" */}
        <div style={{ marginTop: 60, display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "rgba(193, 255, 180, 0.12)",
              border: "1px solid rgba(193, 255, 180, 0.3)",
              color: "#c1ffb4",
              padding: "10px 20px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 26 }}>⚡</span>
            <span>India's #1 EV-only career platform</span>
          </div>
        </div>

        {/* Hero — "EV careers, supercharged." */}
        <div style={{ marginTop: 28, display: "flex" }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            EV careers,
            <br />
            <span style={{ color: "#8fd299" }}>supercharged.</span>
          </div>
        </div>

        {/* Subtitle */}
        <div
          style={{
            marginTop: 26,
            display: "flex",
            fontSize: 24,
            lineHeight: 1.4,
            color: "rgba(255,255,255,0.85)",
            maxWidth: "92%",
          }}
        >
          Find your next role in battery tech, charging infrastructure, powertrain, motors, and EV manufacturing — or hire vetted technicians and engineers.
        </div>

        {/* Footer URL */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>
            {siteName} · {tagline}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#c1ffb4" }}>
            emobility.careers
          </div>
        </div>
      </div>
    ),
    size,
  );
}
