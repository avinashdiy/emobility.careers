import { ImageResponse } from "next/og";
import { db } from "@/lib/db";
import { formatSalaryRange } from "@/lib/utils";
import { brandLogoDataUrl } from "@/lib/og/brand-asset";

export const runtime = "nodejs";
export const alt = "Job on eMobility Careers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Job share card. Layout:
 *   [Company logo + name "is hiring"]
 *   <Big job title>
 *   work mode · location · seniority · salary
 *   ─────────────
 *   "Apply on emobility.careers →"   ← the CTA the user explicitly asked for
 */
export default async function OG({ params }: { params: { slug: string } }) {
  const job = await db.jobPosting.findUnique({
    where: { slug: params.slug },
    include: { company: true },
  });
  if (!job || job.status !== "OPEN") {
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

  const salary =
    !job.salaryHidden && (job.salaryMin || job.salaryMax)
      ? formatSalaryRange(
          job.salaryMin ? Number(job.salaryMin) : null,
          job.salaryMax ? Number(job.salaryMax) : null,
          job.salaryCurrency,
          job.salaryPeriod,
        )
      : null;

  const meta = [
    job.workMode === "REMOTE" ? "Remote" : (job.locations[0] ?? "India"),
    job.workMode.toLowerCase(),
    job.profileMode,
    salary,
  ].filter(Boolean) as string[];

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
        {/* Company strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {job.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.company.logoUrl}
              alt={job.company.name}
              width={64}
              height={64}
              style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", background: "white" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: 64,
                height: 64,
                borderRadius: 12,
                background: "#8fd299",
                color: "#1e2d2a",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                fontWeight: 800,
              }}
            >
              {job.company.name[0]?.toUpperCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "white" }}>{job.company.name}</div>
            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.65)" }}>is hiring</div>
          </div>
        </div>

        {/* Title — the centrepiece */}
        <div style={{ marginTop: 40, display: "flex" }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.01em" }}>
            {job.title.length > 60 ? job.title.slice(0, 60) + "…" : job.title}
          </div>
        </div>

        {/* Meta pills */}
        <div
          style={{
            marginTop: 26,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            fontSize: 20,
            color: "rgba(255,255,255,0.9)",
          }}
        >
          {meta.map((m, i) => (
            <span
              key={i}
              style={{
                background: "rgba(255,255,255,0.1)",
                padding: "8px 18px",
                borderRadius: 999,
              }}
            >
              {m}
            </span>
          ))}
        </div>

        {/* Footer — Apply CTA */}
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 32,
            borderTop: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          {/* Brand wordmark on a white pill — readable on the dark gradient. */}
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: "white", padding: "8px 12px", borderRadius: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandLogoDataUrl()} alt="eMobility Careers" width={160} height={40} />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#8fd299",
              color: "#1e2d2a",
              padding: "12px 22px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 800,
            }}
          >
            <span>Apply on emobility.careers</span>
            <span>→</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
