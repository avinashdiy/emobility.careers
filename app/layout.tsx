import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/toaster";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { MaintenanceGate } from "@/components/layout/MaintenanceGate";
import { MessagingWidget } from "@/components/messaging/MessagingWidget";
import { getSettings } from "@/lib/settings";

// Inter is the modern professional sans-serif standard (LinkedIn uses Source
// Sans 3, which is functionally identical at body sizes). The CSS variable
// keeps the existing token name so Tailwind config doesn't need to change.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-dm-sans",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  // SiteSetting reads are cheap (cached in lib/settings) but we wrap in
  // try/catch because at first boot the table might not exist yet — fall
  // back to hard-coded defaults so a fresh install still renders.
  let siteName = "eMobility Careers";
  let tagline = "Hire & get hired in the EV industry";
  let description = "India's specialised EV-industry talent platform. Battery, charging, powertrain, and motor-control jobs for technicians and engineers. DIYguru-verified candidates.";
  let twitterHandle = "";
  let ogImage = "";
  let keywords = "";
  let allowIndex = true;
  let googleVerify = process.env.GOOGLE_SITE_VERIFICATION ?? "";
  let bingVerify = process.env.BING_SITE_VERIFICATION ?? "";
  try {
    const s = await getSettings(
      "site.name", "site.tagline", "seo.meta_description", "seo.keywords",
      "seo.twitter_handle", "seo.default_og_image", "seo.robots_index",
      "seo.google_verification", "seo.bing_verification",
    );
    if (s["site.name"]) siteName = s["site.name"];
    if (s["site.tagline"]) tagline = s["site.tagline"];
    if (s["seo.meta_description"]) description = s["seo.meta_description"];
    if (s["seo.keywords"]) keywords = s["seo.keywords"];
    if (s["seo.twitter_handle"]) twitterHandle = s["seo.twitter_handle"];
    if (s["seo.default_og_image"]) ogImage = s["seo.default_og_image"];
    if (s["seo.robots_index"] === "false") allowIndex = false;
    if (s["seo.google_verification"]) googleVerify = s["seo.google_verification"];
    if (s["seo.bing_verification"]) bingVerify = s["seo.bing_verification"];
  } catch {
    // Pre-migration boot — defaults stand.
  }

  return {
    title: { default: `${siteName} — ${tagline}`, template: `%s | ${siteName}` },
    description,
    keywords: keywords ? keywords.split(",").map((k) => k.trim()).filter(Boolean) : undefined,
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    robots: allowIndex
      ? {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-video-preview": -1,
            "max-snippet": -1,
          },
        }
      : { index: false, follow: false, googleBot: { index: false, follow: false } },
    openGraph: {
      title: siteName,
      description,
      type: "website",
      siteName,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: siteName,
      description,
      ...(twitterHandle ? { creator: twitterHandle.startsWith("@") ? twitterHandle : `@${twitterHandle}` } : {}),
    },
    verification: {
      ...(googleVerify ? { google: googleVerify } : {}),
      ...(bingVerify ? { other: { "msvalidate.01": bingVerify } } : {}),
    },
  };
}

const SITE_JSON_LD_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://emobility.careers";
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_JSON_LD_BASE}#org`,
      name: "eMobility Careers",
      url: SITE_JSON_LD_BASE,
      logo: `${SITE_JSON_LD_BASE}/icon.png`,
      sameAs: [
        "https://www.linkedin.com/company/emobility-careers",
        "https://twitter.com/emobilitycareer",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_JSON_LD_BASE}#site`,
      url: SITE_JSON_LD_BASE,
      name: "eMobility Careers",
      publisher: { "@id": `${SITE_JSON_LD_BASE}#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_JSON_LD_BASE}/jobs?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.variable, "font-sans bg-emce-light-bg text-emce-text antialiased")}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
        <MaintenanceGate>{children}</MaintenanceGate>
        {/* Floating LinkedIn-style messaging dock — sticks to bottom-right
            on every authenticated page (the widget itself short-circuits
            on signed-out, admin, and in-thread routes). */}
        <Suspense fallback={null}>
          <MessagingWidget />
        </Suspense>
        <Suspense fallback={null}>
          <ToastFromSearchParams />
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
