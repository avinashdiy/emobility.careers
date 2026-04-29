import { ImageResponse } from "next/og";

/**
 * Programmatic favicon — Next reads this and serves a 32x32 PNG at /icon
 * with the right `<link rel="icon">` headers. The lime-on-teal "eM" tile
 * matches the in-app logo block so browser tabs immediately read as
 * eMobility Careers.
 *
 * No `public/favicon.ico` needed — Next's metadata system handles tab
 * icons, search-result icons, and PWA icons via this single file plus the
 * matching `apple-icon.tsx`.
 */

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#374a47",
          color: "#c1ffb4",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "-0.04em",
          fontFamily: "system-ui, sans-serif",
          borderRadius: 6,
        }}
      >
        eM
      </div>
    ),
    size,
  );
}
