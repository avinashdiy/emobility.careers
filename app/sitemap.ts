import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  const staticPaths: MetadataRoute.Sitemap = [
    "",
    "/jobs",
    "/companies",
    "/about",
    "/signup",
    "/signin",
  ].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: p === "/jobs" ? "hourly" : "daily",
    priority: p === "" ? 1 : 0.8,
  }));

  const jobs = await db.jobPosting.findMany({
    where: { status: "OPEN" },
    select: { id: true, updatedAt: true },
    orderBy: { publishedAt: "desc" },
    take: 1000,
  }).catch(() => []);

  const companies = await db.company.findMany({
    where: { verificationStatus: "VERIFIED" },
    select: { slug: true, updatedAt: true },
    take: 500,
  }).catch(() => []);

  const candidates = await db.candidateProfile.findMany({
    where: { cvVisibility: "EVERYONE" },
    select: { slug: true, updatedAt: true },
    take: 5000,
  }).catch(() => []);

  return [
    ...staticPaths,
    ...jobs.map((j) => ({
      url: `${base}/jobs/${j.id}`,
      lastModified: j.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...companies.map((c) => ({
      url: `${base}/company/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...candidates.map((c) => ({
      url: `${base}/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
