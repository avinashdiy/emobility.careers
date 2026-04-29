import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";

export const runtime = "nodejs";
export const alt = "Mentor on eMobility Careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Mentor share card. Layout mirrors the profile OG so a candidate sharing
 * "I just booked a session with X" gets a face-front preview, with the
 * mentor's headline and pricing badge.
 */
export default async function OG({ params }: { params: { slug: string } }) {
  const mentor = await db.mentorProfile.findFirst({
    where: { isPublished: true, kycStatus: "APPROVED", user: { candidateProfile: { slug: params.slug } } },
    include: {
      user: {
        select: {
          candidateProfile: {
            select: { firstName: true, lastName: true, profilePhotoUrl: true, isDIYguruVerified: true },
          },
        },
      },
    },
  });

  if (!mentor || !mentor.user.candidateProfile) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#1e2d2a", color: "#c1ffb4", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 800 }}>
          eMobility Careers
        </div>
      ),
      size,
    );
  }

  const cp = mentor.user.candidateProfile;
  const fullName = `${cp.firstName} ${cp.lastName ?? ""}`.trim();
  const initials = ((cp.firstName?.[0] ?? "") + (cp.lastName?.[0] ?? "")).toUpperCase() || "?";

  const priceLabel = mentor.acceptingFree && !mentor.acceptingPaid
    ? "Free sessions"
    : mentor.acceptingPaid
    ? `${new Intl.NumberFormat("en-IN", { style: "currency", currency: mentor.currency, maximumFractionDigits: 0 }).format(mentor.pricePerSessionMinor / 100)} / session`
    : null;

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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 460, padding: 48, background: "rgba(0,0,0,0.18)" }}>
          {cp.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cp.profilePhotoUrl}
              alt={fullName}
              width={300}
              height={300}
              style={{ width: 300, height: 300, borderRadius: "50%", objectFit: "cover", border: "8px solid #8fd299" }}
            />
          ) : (
            <div style={{ display: "flex", width: 300, height: 300, borderRadius: "50%", background: "#8fd299", color: "#1e2d2a", alignItems: "center", justifyContent: "center", fontSize: 120, fontWeight: 800, border: "8px solid #c1ffb4" }}>
              {initials}
            </div>
          )}
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 8, background: "rgba(193, 255, 180, 0.18)", border: "1px solid rgba(193, 255, 180, 0.4)", color: "#c1ffb4", padding: "8px 16px", borderRadius: 999, fontSize: 18, fontWeight: 700 }}>
            <span>🎓</span><span>EV Mentor</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, padding: 64 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "rgba(255,255,255,0.7)" }}>Book a 1:1 session with</div>
          <div style={{ marginTop: 8, fontSize: 64, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            {fullName}
          </div>
          <div style={{ marginTop: 18, fontSize: 26, lineHeight: 1.35, color: "#c1ffb4" }}>
            {mentor.headline.length > 110 ? mentor.headline.slice(0, 110) + "…" : mentor.headline}
          </div>
          {priceLabel && (
            <div style={{ marginTop: 22, display: "flex" }}>
              <div style={{ background: "#8fd299", color: "#1e2d2a", padding: "10px 20px", borderRadius: 999, fontSize: 22, fontWeight: 800 }}>
                {priceLabel}
              </div>
            </div>
          )}
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 32, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            {/* Brand wordmark on a white pill — readable on the dark gradient. */}
            <div style={{ display: "flex" }}>
              <div style={{ display: "flex", background: "white", padding: "8px 12px", borderRadius: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brandLogoDataUrl()} alt="eMobility Careers" width={160} height={40} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>Book on emobility.careers →</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
