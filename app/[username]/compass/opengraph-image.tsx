import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { computeCompass } from "@/lib/skill-compass";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

export const runtime = "nodejs";
export const alt = "EV Skill Compass on emobility.careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Compass share preview. The image is the same stat-card aesthetic as
 * the on-page card, sized for 1200×630 (LinkedIn / WhatsApp / X
 * standard). Renders the candidate's actual photo when public, falling
 * back to initials. Hidden behind a "private profile" notice when the
 * candidate isn't public — we never leak skill data to a share unfurl
 * for someone who didn't opt into it.
 */
function privateFallback() {
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
          fontSize: 56,
          fontWeight: 800,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        EV Skill Compass · private
      </div>
    ),
    size,
  );
}

export default async function CompassOG({
  params,
}: {
  params: { username: string };
}) {
  if (RESERVED_SLUGS.has(params.username.toLowerCase())) return privateFallback();

  const profile = await db.candidateProfile.findUnique({
    where: { slug: params.username },
    select: {
      id: true,
      slug: true,
      firstName: true,
      lastName: true,
      headline: true,
      profilePhotoUrl: true,
      isDIYguruVerified: true,
      cvVisibility: true,
    },
  });
  if (!profile) return privateFallback();
  if (profile.cvVisibility !== "EVERYONE") return privateFallback();

  const result = await computeCompass(profile.id);
  if (!result) return privateFallback();

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const initials =
    (profile.firstName?.[0] ?? "?") + (profile.lastName?.[0] ?? "");

  const archetypeBg =
    result.archetype === "Polymath" ? "#8fd299"
    : result.archetype === "Specialist" ? "#e8833a"
    : "#c1ffb4";
  const archetypeFg =
    result.archetype === "Specialist" ? "white" : "#1e2d2a";

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
        {/* Brand wordmark on a white pill */}
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
            ⚡ EV Skill Compass
          </div>
        </div>

        {/* Identity row */}
        <div style={{ display: "flex", marginTop: 32, alignItems: "center", gap: 20 }}>
          {profile.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profilePhotoUrl}
              alt={fullName}
              width={88}
              height={88}
              style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "4px solid #8fd299" }}
            />
          ) : (
            <div style={{ display: "flex", width: 88, height: 88, borderRadius: "50%", background: "#8fd299", color: "#1e2d2a", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 800, border: "4px solid #c1ffb4" }}>
              {initials.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              {fullName}
              {profile.isDIYguruVerified && (
                <span style={{ marginLeft: 12, fontSize: 18, color: "#c1ffb4" }}>
                  ⭐ DIYguru
                </span>
              )}
            </div>
            {profile.headline && (
              <div style={{ marginTop: 4, fontSize: 22, color: "rgba(255,255,255,0.75)" }}>
                {profile.headline.length > 80 ? profile.headline.slice(0, 80) + "…" : profile.headline}
              </div>
            )}
          </div>
        </div>

        {/* Big number + archetype */}
        <div style={{ display: "flex", marginTop: 28, alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ fontSize: 130, fontWeight: 800, color: "#8fd299", lineHeight: 1 }}>
              {result.overall.toFixed(1)}
            </div>
            <div style={{ marginLeft: 8, fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
              /10
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              background: archetypeBg,
              color: archetypeFg,
            }}
          >
            {result.archetype}
          </div>
        </div>

        {/* Six domains, two columns */}
        <div style={{ display: "flex", marginTop: 28, gap: 36 }}>
          {[result.domains.slice(0, 3), result.domains.slice(3)].map((column, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 10 }}>
              {column.map((d) => {
                const pct = (d.raw / 10) * 100;
                return (
                  <div key={d.slug} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 26, textAlign: "center", fontSize: 22 }}>{d.emoji}</span>
                    <span style={{ width: 130, fontSize: 18, fontWeight: 700 }}>{d.name}</span>
                    <div style={{ display: "flex", flex: 1, height: 10, borderRadius: 999, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                      <div style={{ display: "flex", width: `${pct}%`, background: "#8fd299" }} />
                    </div>
                    <span style={{ width: 32, textAlign: "right", fontSize: 22, fontWeight: 800 }}>
                      {d.level}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer URL */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 24,
            borderTop: "1px solid rgba(255,255,255,0.18)",
            fontSize: 18,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          <span>Verified across six EV domains · top-3 average</span>
          <span style={{ fontWeight: 800, color: "#c1ffb4" }}>
            emobility.careers/{profile.slug}/compass
          </span>
        </div>
      </div>
    ),
    size,
  );
}
