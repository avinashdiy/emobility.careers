import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "eMobility Careers job";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({ params }: { params: { id: string } }) {
  const job = await db.jobPosting.findUnique({
    where: { id: params.id },
    include: { company: true },
  });
  if (!job || job.status !== "OPEN") {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: "100%", height: "100%", background: "#1e2d2a", color: "#c1ffb4", alignItems: "center", justifyContent: "center", fontSize: 60, fontWeight: 800 }}>
          eMobility Careers
        </div>
      ),
      size,
    );
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "#8fd299", color: "#1e2d2a", padding: "8px 12px", borderRadius: 10, fontWeight: 800 }}>eM</div>
          <div style={{ fontWeight: 800, fontSize: 28 }}>eMobility<span style={{ color: "#8fd299" }}>.careers</span></div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 32, color: "#c1ffb4", fontWeight: 700 }}>
            {job.company.name}
          </div>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, marginTop: 8 }}>
            {job.title.length > 60 ? job.title.slice(0, 60) + "…" : job.title}
          </div>
          <div style={{ marginTop: 20, display: "flex", gap: 14, fontSize: 22, color: "rgba(255,255,255,0.85)" }}>
            <span>{job.workMode}</span>
            <span>·</span>
            <span>{job.locations[0] ?? "India"}</span>
            <span>·</span>
            <span>{job.profileMode}</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
