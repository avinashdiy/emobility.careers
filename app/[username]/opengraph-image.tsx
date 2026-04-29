import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { RESERVED_SLUGS } from "@/lib/reserved-slugs";

export const runtime = "nodejs";
export const alt = "eMobility Careers profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Profile share card. WhatsApp / LinkedIn / X unfurl this when someone
 * shares an `emobility.careers/<username>` URL. We render the actual
 * profile photo (via Satori's <img>) so the preview feels personal —
 * matching LinkedIn's profile share behaviour.
 *
 * Visibility-respecting: PRIVATE and EMPLOYERS_ONLY profiles fall back to
 * the generic brand card so we don't leak identity into a public unfurler.
 */
function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#1e2d2a",
          color: "#c1ffb4",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 60,
          fontWeight: 800,
        }}
      >
        eMobility Careers
      </div>
    ),
    size,
  );
}

export default async function OG({ params }: { params: { username: string } }) {
  if (RESERVED_SLUGS.has(params.username.toLowerCase())) return fallback();

  const profile = await db.candidateProfile.findUnique({
    where: { slug: params.username },
    select: {
      firstName: true, lastName: true, headline: true, location: true,
      cvVisibility: true, isDIYguruVerified: true,
      totalExperienceMonths: true, profileMode: true,
      profilePhotoUrl: true,
      personType: true,
      evDomains: { include: { evDomain: { select: { name: true } } }, take: 3 },
    },
  });
  if (!profile || profile.cvVisibility !== "EVERYONE") return fallback();

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ");
  const initials = ((profile.firstName?.[0] ?? "") + (profile.lastName?.[0] ?? "")).toUpperCase() || "?";
  const totalYears = (profile.totalExperienceMonths / 12).toFixed(1);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(160deg, #1e2d2a 0%, #374a47 40%, #3d5e58 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Left column — photo + brand */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 460,
            padding: 48,
            background: "rgba(0,0,0,0.18)",
          }}
        >
          {/* Photo or initials disc */}
          {profile.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profilePhotoUrl}
              alt={fullName}
              width={320}
              height={320}
              style={{
                width: 320,
                height: 320,
                borderRadius: "50%",
                objectFit: "cover",
                border: "8px solid #8fd299",
                boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 320,
                height: 320,
                borderRadius: "50%",
                background: "#8fd299",
                color: "#1e2d2a",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 130,
                fontWeight: 800,
                border: "8px solid #c1ffb4",
                boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
              }}
            >
              {initials}
            </div>
          )}

          <div style={{ marginTop: 36, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#8fd299", color: "#1e2d2a", padding: "6px 10px", borderRadius: 8, fontWeight: 800, fontSize: 18 }}>eM</div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>
              eMobility<span style={{ color: "#8fd299" }}>.careers</span>
            </div>
          </div>
        </div>

        {/* Right column — identity */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            padding: 64,
          }}
        >
          {profile.isDIYguruVerified && (
            <div style={{ display: "flex" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "rgba(193, 255, 180, 0.18)",
                  border: "1px solid rgba(193, 255, 180, 0.4)",
                  color: "#c1ffb4",
                  padding: "8px 16px",
                  borderRadius: 999,
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 20,
                }}
              >
                <span>⭐</span><span>DIYguru Verified</span>
              </div>
            </div>
          )}

          <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            {fullName}
          </div>

          {profile.headline && (
            <div style={{ marginTop: 16, fontSize: 26, lineHeight: 1.35, color: "#c1ffb4" }}>
              {profile.headline.length > 100 ? profile.headline.slice(0, 100) + "…" : profile.headline}
            </div>
          )}

          <div
            style={{
              marginTop: 22,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              fontSize: 18,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            <span style={{ background: "rgba(255,255,255,0.1)", padding: "6px 14px", borderRadius: 999 }}>
              {profile.profileMode}
            </span>
            <span style={{ background: "rgba(255,255,255,0.1)", padding: "6px 14px", borderRadius: 999 }}>
              {totalYears} yrs experience
            </span>
            {profile.location && (
              <span style={{ background: "rgba(255,255,255,0.1)", padding: "6px 14px", borderRadius: 999 }}>
                📍 {profile.location}
              </span>
            )}
          </div>

          {profile.evDomains.length > 0 && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                fontSize: 16,
                color: "#8fd299",
              }}
            >
              {profile.evDomains.map((d) => (
                <span key={d.evDomain.name} style={{ border: "1px solid rgba(143, 210, 153, 0.4)", padding: "4px 12px", borderRadius: 999 }}>
                  {d.evDomain.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
