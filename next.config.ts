import type { NextConfig } from "next";

const securityHeaders = [
  // SAMEORIGIN (not DENY) so careers pages can embed their own
  // routes in iframes — specifically the application-detail page
  // embeds the resume-preview proxy route to show a PDF inline.
  // DENY blocks ALL framing including same-origin; SAMEORIGIN only
  // blocks cross-origin framing, which is the real clickjacking
  // threat. Internal iframes are by definition trusted (the framing
  // page is our own code).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
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
    // 80 is the new entry for avatar discs (matches the WebP quality
    // emitted by `uploadAvatar`'s sharp pipeline). 95 stays for the
    // brand mark + icon that need to stay crisp on retina.
    qualities: [50, 75, 80, 95],
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "media.licdn.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      // Production MinIO endpoint served via Caddy. Without this,
      // every <Image /> rendering a profile photo from
      // files.emobility.careers gets rejected by the optimizer and
      // falls back to alt-text. Matches the S3_PUBLIC_URL pattern
      // (see lib/storage.ts) — wildcard subdomain covers any future
      // `images.` or `cdn.` subdomain we add.
      { protocol: "https", hostname: "**.emobility.careers" },
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
