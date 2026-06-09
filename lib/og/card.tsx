import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";

/**
 * Shared Open Graph card renderer — the branded 1200x630 social-share
 * image used by every route that has no route-specific featured image
 * (job-fair banner, company logo, article cover, profile photo, etc).
 *
 * RELIABILITY IS THE WHOLE POINT. The original homepage OG (and the
 * earlier pulse card) learned the hard way that doing a DB query at
 * crawl time makes the render slow + flaky — WhatsApp's crawler has an
 * aggressive timeout and falls back to the favicon when the image is
 * slow. So this helper takes ONLY plain strings the caller already has
 * in hand (no DB, no remote image fetch). The single image asset it
 * uses is the brand logo, inlined as a data URL off local disk via
 * brandLogoDataUrl(). Result: zero-network, sub-100ms renders that
 * never time out.
 *
 * Satori (next/og's renderer) constraints baked in here, learned from
 * the earlier OG files:
 *   - Every parent element with >1 child sets display:flex explicitly.
 *   - Only system-ui font + ASCII/common glyphs. Exotic codepoints
 *     (✦, etc) crash the render with "no font found" — we use ⚡ which
 *     the system emoji font resolves, matching the homepage poster.
 *   - Fonts are NOT loaded from network; system-ui is always present.
 *
 * Each route's opengraph-image.tsx stays a ~12-line file that sets the
 * Next.js metadata exports (size/contentType/runtime/revalidate/alt)
 * and calls ogCard(...) with its own copy. Visual consistency across
 * every share card without re-implementing the gradient + layout +
 * footer N times.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

export interface OgCardOptions {
  /** Small uppercase kicker above the title, e.g. "EV JOB FAIRS". */
  eyebrow: string;
  /** The headline — keep under ~60 chars so it stays 2 lines max. */
  title: string;
  /** One supporting sentence under the title. Optional. */
  subtitle?: string;
  /** Up to ~5 pill chips spelling out what's on the page. Optional. */
  chips?: string[];
  /** Footer left-hand context line. Defaults to the brand tagline. */
  footerLeft?: string;
}

export function ogCard(opts: OgCardOptions): ImageResponse {
  const { eyebrow, title, subtitle, chips, footerLeft } = opts;
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
        {/* Top row — wordmark pill + "updated daily" badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              background: "white",
              padding: "12px 18px",
              borderRadius: 14,
            }}
          >
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

        {/* Eyebrow */}
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
          ⚡ {eyebrow}
        </div>

        {/* Title — the line everyone sees first on WhatsApp / LinkedIn */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: "white",
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        {subtitle ? (
          <div
            style={{
              marginTop: 22,
              display: "flex",
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.3,
              color: "rgba(255,255,255,0.82)",
              maxWidth: 900,
            }}
          >
            {subtitle}
          </div>
        ) : null}

        {/* Chips */}
        {chips && chips.length > 0 ? (
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {chips.map((c) => (
              <span
                key={c}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  padding: "10px 22px",
                  borderRadius: 999,
                  fontSize: 22,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.92)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", marginTop: "auto" }} />
        )}

        {/* Footer */}
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
            {footerLeft ?? "The global EV industry · Hiring · Salaries · People · Pulse"}
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: "#c1ffb4" }}>
            emobility.careers
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
