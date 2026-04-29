import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

export const runtime = "nodejs";
export const alt = "eMobility Careers candidate";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({ params }: { params: { username: string } }) {
  if (RESERVED_SLUGS.has(params.username.toLowerCase())) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#1e2d2a", color: "#c1ffb4", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 800 }}>
          eMobility Careers
        </div>
      ),
      size,
    );
  }
  const profile = await db.candidateProfile.findUnique({
    where: { slug: params.username },
    select: {
      firstName: true, lastName: true, headline: true, location: true,
      cvVisibility: true, isDIYguruVerified: true,
      totalExperienceMonths: true, profileMode: true,
    },
  });
  if (!profile || profile.cvVisibility !== "EVERYONE") {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#1e2d2a", color: "#c1ffb4", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 800 }}>
          eMobility Careers
        </div>
      ),
      size,
    );
  }

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#8fd299", color: "#1e2d2a", padding: "8px 12px", borderRadius: 10, fontWeight: 800 }}>eM</div>
          <div style={{ fontWeight: 800, fontSize: 28 }}>eMobility<span style={{ color: "#8fd299" }}>.careers</span></div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>{fullName}</div>
          {profile.headline && (
            <div style={{ fontSize: 30, color: "#c1ffb4", marginTop: 12 }}>
              {profile.headline.length > 80 ? profile.headline.slice(0, 80) + "…" : profile.headline}
            </div>
          )}
          <div style={{ marginTop: 20, display: "flex", gap: 14, fontSize: 22, color: "rgba(255,255,255,0.85)" }}>
            {profile.isDIYguruVerified && (
              <span style={{ background: "#fff8e1", color: "#7a5a00", padding: "4px 12px", borderRadius: 20 }}>⭐ DIYguru</span>
            )}
            <span>{profile.profileMode}</span>
            <span>·</span>
            <span>{(profile.totalExperienceMonths / 12).toFixed(1)} yrs</span>
            {profile.location && (
              <>
                <span>·</span>
                <span>{profile.location}</span>
              </>
            )}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
