import { ImageResponse } from "next/og";

/**
 * iOS / iPadOS home-screen icon. 180×180 is the spec; iOS auto-resizes for
 * smaller positions (Spotlight, Settings) so we don't need extra sizes.
 * Same lime-on-teal tile as `icon.tsx`, scaled up.
 */

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 96,
          letterSpacing: "-0.05em",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        eM
      </div>
    ),
    size,
  );
}
