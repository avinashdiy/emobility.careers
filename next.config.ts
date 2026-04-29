import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // HSTS — only meaningful behind TLS in prod
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    // Next.js 15 requires every non-default `quality` value used on
    // <Image /> to be declared here — otherwise the optimizer endpoint
    // returns 400 and the <img> falls back to its alt text (which is
    // why the wordmark + icon were rendering as broken text in prod).
    // Our brand mark + icon ask for q=95 to stay crisp on retina at
    // small px heights, so 95 must be allow-listed alongside 75.
    qualities: [50, 75, 95],
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "minio" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      // Legacy public-profile URLs → vanity root URL (LinkedIn-style).
      // Permanent so search engines update their indexes and old shares don't break.
      {
        source: "/c/:username",
        destination: "/:username",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
