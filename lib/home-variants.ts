import "server-only";
import type { Country } from "@prisma/client";

/**
 * Country-aware homepage content.
 *
 * The marketing homepage (/) varies its copy by the viewer's country so
 * a student in Pune sees "India's EV industry hires, gets hired" with
 * a Tata EV / Pune / ₹24L example, while a candidate in Sydney sees
 * Australia copy with a BYD / Sydney / AU$ example. Five variants
 * (IN / AU / AE / US / GB) ship today; visitors from any other country
 * fall through to the IN variant because India is the home market with
 * the densest content (job count, salaries, employers, recruitathons).
 *
 * SEO note: the canonical-per-country routes already exist at
 * /in, /au, /ae, /us, /uk (CountryLandingPage component). The
 * homepage emits hreflang alternates pointing at those URLs so Google
 * indexes each region's landing without duplicate-content penalty.
 * The visitor-facing / page itself stays a single URL — Cloudflare
 * caches by CF-IPCountry, and Googlebot fetches the IN variant by
 * default from US datacenters (CF-IPCountry=US is mapped to the US
 * variant which won't duplicate /in content).
 *
 * To add a sixth variant (e.g. Singapore once SG is added to the
 * Country enum), append to HOME_VARIANT_COUNTRIES + write the
 * matching HOME_VARIANTS[SG] entry. No call-site changes needed.
 */

export type HomeVariantCountry = "IN" | "AU" | "AE" | "US" | "GB";

export const HOME_VARIANT_COUNTRIES: HomeVariantCountry[] = [
  "IN",
  "AU",
  "AE",
  "US",
  "GB",
];

export interface HomeVariant {
  /** ISO code (matches the Country enum). */
  code: HomeVariantCountry;
  /** Flag emoji for switcher UI. */
  flag: string;
  /** Display name for switcher UI ("India", "Australia"). */
  displayName: string;
  /** hreflang code in BCP-47. */
  hreflang: string;
  /** Canonical country-page path (used in hreflang alternates). */
  countryPath: string;

  metaTitle: string;
  metaDescription: string;
  ogDescription: string;

  /** Hero copy block. */
  hero: {
    eyebrow: string;
    /** Plain prefix of the h1, before the gradient-span. */
    h1Lead: string;
    /** The gradient-coloured tail of the h1. */
    h1Tail: string;
    subtitle: string;
  };

  /** Sample notification card floating on the hero image (right side). */
  matchCard: {
    /** Role and company shown on the card. */
    title: string;
    /** "City · salary range · time ago". */
    meta: string;
  };

  /** Editorial intro section ("Where the EV industry comes to work"). */
  editorialIntro: {
    badge: string;
    h2: string;
    body: string;
  };

  /** Recruitathon hybrid section ("Hire from anywhere"). */
  hybrid: {
    /** Example sentence: "Run a Recruitathon in X. Interview a candidate in Y." */
    example: string;
  };

  /** Job fair editorial section. */
  jobFair: {
    badge: string;
    body: string;
  };

  /** "EV companies hiring on emobility.careers" logo wall description. */
  logoWallBody: string;

  /** Final CTA strip at bottom of homepage. */
  finalCta: {
    h2: string;
    subtitle: string;
  };
}

export const HOME_VARIANTS: Record<HomeVariantCountry, HomeVariant> = {
  IN: {
    code: "IN",
    flag: "🇮🇳",
    displayName: "India",
    hreflang: "en-IN",
    countryPath: "/in",

    metaTitle: "The address of EV in India · Jobs, salaries, people, pulse",
    metaDescription:
      "Where India's EV industry hires, gets hired, and reads what's happening — every day. Live snapshot of jobs, salaries, companies, and the people moving the industry.",
    ogDescription:
      "Where India's EV industry hires, gets hired, and reads what's happening — every day.",

    hero: {
      eyebrow: "✦ The address of EV in India",
      h1Lead: "Where India's EV industry ",
      h1Tail: "hires, gets hired.",
      subtitle:
        "Battery, charging, motors, vehicles and software — every EV career under one platform. 50,000+ professionals. 1,200+ companies. Find your next role, or your next hire.",
    },

    matchCard: {
      title: "Battery Engineer · Tata EV",
      meta: "Pune · ₹24-32L · 4 days ago",
    },

    editorialIntro: {
      badge: "⚡ Built for India's EV industry",
      h2: "Where India's EV industry comes to work.",
      body: "From the latest battery-engineer roles in Pune to ATS-grade hiring tools for fleet operators in Bengaluru — emobility.careers is the platform 50,000+ EV professionals call home. Browse open roles. Get matched. Move the industry forward.",
    },

    hybrid: {
      example: "Run a Recruitathon in Pune. Interview a candidate in Delhi.",
    },

    jobFair: {
      badge: "📍 Job fairs across India",
      body: "Multi-day hiring events bring top EV companies and serious candidates into one room. Pune, Bengaluru, Delhi, Chennai — and now joining-from-anywhere thanks to hybrid mode. Walk a booth in person, or join a 30-minute interview slot from your laptop. Same pipeline, same recruiter, same hire.",
    },

    logoWallBody:
      "From OEMs and battery makers to charging networks and EV fleets — the full Indian EV stack lives here. Click any name to see open roles + the company page.",

    finalCta: {
      h2: "Become part of India's EV story.",
      subtitle:
        "Sign up free. Post a role. Submit a salary. Roast your resume. Every action helps the next person navigate the industry.",
    },
  },

  AU: {
    code: "AU",
    flag: "🇦🇺",
    displayName: "Australia",
    hreflang: "en-AU",
    countryPath: "/au",

    metaTitle: "The address of EV in Australia · Jobs, salaries, people, pulse",
    metaDescription:
      "Where Australia's EV industry hires, gets hired, and reads what's happening — every day. Live snapshot of jobs, salaries, companies, and the people moving the industry.",
    ogDescription:
      "Where Australia's EV industry hires, gets hired, and reads what's happening — every day.",

    hero: {
      eyebrow: "✦ The address of EV in Australia",
      h1Lead: "Where Australia's EV industry ",
      h1Tail: "hires, gets hired.",
      subtitle:
        "Battery, charging, motors, vehicles and software — every EV career under one platform. From Sydney to Melbourne, Brisbane to Perth. Find your next role, or your next hire.",
    },

    matchCard: {
      title: "Senior BMS Engineer · BYD Australia",
      meta: "Sydney · AU$ 130-160k · 2 days ago",
    },

    editorialIntro: {
      badge: "⚡ Built for Australia's EV industry",
      h2: "Where Australia's EV industry comes to work.",
      body: "From battery engineers in Sydney to charging-network leads in Melbourne, BYD service techs in Brisbane to Tesla supercharger ops in Perth — emobility.careers is where Australia's EV industry hires. Browse open roles. Get matched. Move the industry forward.",
    },

    hybrid: {
      example: "Run a Recruitathon in Sydney. Interview a candidate in Perth.",
    },

    jobFair: {
      badge: "📍 Job fairs across Australia",
      body: "Multi-day hiring events bring top EV companies and serious candidates into one room. Sydney, Melbourne, Brisbane, Perth — and now joining-from-anywhere thanks to hybrid mode. Walk a booth in person, or join a 30-minute interview slot from your laptop. Same pipeline, same recruiter, same hire.",
    },

    logoWallBody:
      "From global OEMs and battery makers to charging networks and EV fleets across Australia — click any name to see open roles + the company page.",

    finalCta: {
      h2: "Become part of Australia's EV story.",
      subtitle:
        "Sign up free. Post a role. Submit a salary. Roast your resume. Every action helps the next person navigate the industry — from Sydney to Perth.",
    },
  },

  AE: {
    code: "AE",
    flag: "🇦🇪",
    displayName: "UAE",
    hreflang: "en-AE",
    countryPath: "/ae",

    metaTitle: "The address of EV in the UAE · Jobs, salaries, people, pulse",
    metaDescription:
      "Where the UAE's EV industry hires, gets hired, and reads what's happening — every day. Live snapshot of jobs, salaries, companies, and the people moving the industry.",
    ogDescription:
      "Where the UAE's EV industry hires, gets hired, and reads what's happening — every day.",

    hero: {
      eyebrow: "✦ The address of EV in the UAE",
      h1Lead: "Where the UAE's EV industry ",
      h1Tail: "hires, gets hired.",
      subtitle:
        "Battery, charging, motors, vehicles and software — every EV career under one platform. From Dubai to Abu Dhabi, Sharjah to Ras Al Khaimah. Find your next role, or your next hire.",
    },

    matchCard: {
      title: "Charging Infra Lead · DEWA",
      meta: "Dubai · AED 280-360k · 2 days ago",
    },

    editorialIntro: {
      badge: "⚡ Built for the UAE's EV industry",
      h2: "Where the UAE's EV industry comes to work.",
      body: "From charging-infrastructure leads in Dubai to fleet-electrification roles in Abu Dhabi, EV manufacturing in Sharjah to mobility-as-a-service ops across the Emirates — emobility.careers is where the UAE's EV industry hires. Browse open roles. Get matched.",
    },

    hybrid: {
      example: "Run a Recruitathon in Dubai. Interview a candidate in Abu Dhabi.",
    },

    jobFair: {
      badge: "📍 Job fairs across the UAE",
      body: "Multi-day hiring events bring top EV companies and serious candidates into one room. Dubai, Abu Dhabi, Sharjah, Ras Al Khaimah — and now joining-from-anywhere thanks to hybrid mode. Walk a booth in person, or join a 30-minute interview slot from your laptop. Same pipeline, same recruiter, same hire.",
    },

    logoWallBody:
      "From global OEMs and battery makers to UAE charging networks and EV fleets — click any name to see open roles + the company page.",

    finalCta: {
      h2: "Become part of the UAE's EV story.",
      subtitle:
        "Sign up free. Post a role. Submit a salary. Roast your resume. Every action helps the next person navigate the industry — from Dubai to Ras Al Khaimah.",
    },
  },

  US: {
    code: "US",
    flag: "🇺🇸",
    displayName: "United States",
    hreflang: "en-US",
    countryPath: "/us",

    metaTitle: "The address of EV in America · Jobs, salaries, people, pulse",
    metaDescription:
      "Where America's EV industry hires, gets hired, and reads what's happening — every day. Live snapshot of jobs, salaries, companies, and the people moving the industry.",
    ogDescription:
      "Where America's EV industry hires, gets hired, and reads what's happening — every day.",

    hero: {
      eyebrow: "✦ The address of EV in America",
      h1Lead: "Where America's EV industry ",
      h1Tail: "hires, gets hired.",
      subtitle:
        "Battery, charging, motors, vehicles and software — every EV career under one platform. From the SF Bay to Detroit, Austin to Boston. Find your next role, or your next hire.",
    },

    matchCard: {
      title: "Senior Battery Cell Engineer · Tesla",
      meta: "Fremont, CA · US$ 180-220k · 2 days ago",
    },

    editorialIntro: {
      badge: "⚡ Built for America's EV industry",
      h2: "Where America's EV industry comes to work.",
      body: "From battery cell engineers in Fremont to charging-network ops in Austin, fleet leads in Detroit to powertrain research at NREL — emobility.careers is where America's EV industry hires. Browse open roles. Get matched. Move the industry forward.",
    },

    hybrid: {
      example: "Run a Recruitathon in Detroit. Interview a candidate in San Francisco.",
    },

    jobFair: {
      badge: "📍 Job fairs across the US",
      body: "Multi-day hiring events bring top EV companies and serious candidates into one room. Detroit, San Francisco, Austin, Boston — and now joining-from-anywhere thanks to hybrid mode. Walk a booth in person, or join a 30-minute interview slot from your laptop. Same pipeline, same recruiter, same hire.",
    },

    logoWallBody:
      "From Tesla, Rivian, and Lucid to the full charging-network + battery-supplier roster — click any name to see open roles + the company page.",

    finalCta: {
      h2: "Become part of America's EV story.",
      subtitle:
        "Sign up free. Post a role. Submit a salary. Roast your resume. Every action helps the next person navigate the industry — from Fremont to Detroit, Austin to Boston.",
    },
  },

  GB: {
    code: "GB",
    flag: "🇬🇧",
    displayName: "United Kingdom",
    hreflang: "en-GB",
    // Canonical URL stays /uk even though the ISO code is GB
    // (existing route, brand-recognised "UK" reads better than "GB").
    countryPath: "/uk",

    metaTitle: "The address of EV in the UK · Jobs, salaries, people, pulse",
    metaDescription:
      "Where the UK's EV industry hires, gets hired, and reads what's happening — every day. Live snapshot of jobs, salaries, companies, and the people moving the industry.",
    ogDescription:
      "Where the UK's EV industry hires, gets hired, and reads what's happening — every day.",

    hero: {
      eyebrow: "✦ The address of EV in the UK",
      h1Lead: "Where the UK's EV industry ",
      h1Tail: "hires, gets hired.",
      subtitle:
        "Battery, charging, motors, vehicles and software — every EV career under one platform. From London to Manchester, Coventry to Sunderland. Find your next role, or your next hire.",
    },

    matchCard: {
      title: "Powertrain Lead · Jaguar Land Rover",
      meta: "Coventry · £75-95k · 2 days ago",
    },

    editorialIntro: {
      badge: "⚡ Built for the UK's EV industry",
      h2: "Where the UK's EV industry comes to work.",
      body: "From powertrain engineers at JLR Coventry to battery research at the Faraday Institution, charging-network roles in London to Nissan UK manufacturing in Sunderland — emobility.careers is where the UK's EV industry hires. Browse open roles. Get matched.",
    },

    hybrid: {
      example: "Run a Recruitathon in Coventry. Interview a candidate in London.",
    },

    jobFair: {
      badge: "📍 Job fairs across the UK",
      body: "Multi-day hiring events bring top EV companies and serious candidates into one room. London, Manchester, Coventry, Sunderland — and now joining-from-anywhere thanks to hybrid mode. Walk a booth in person, or join a 30-minute interview slot from your laptop. Same pipeline, same recruiter, same hire.",
    },

    logoWallBody:
      "From JLR, Nissan UK, and Bentley to charging operators and battery-tech startups across the UK — click any name to see open roles + the company page.",

    finalCta: {
      h2: "Become part of Britain's EV story.",
      subtitle:
        "Sign up free. Post a role. Submit a salary. Roast your resume. Every action helps the next person navigate the industry — from Coventry to London, Sunderland to Manchester.",
    },
  },
};

/**
 * Pick the homepage variant matching the resolved viewer country.
 *
 * Visitors from non-listed countries (MY, BD, NP, or anywhere else)
 * fall through to the IN variant — India is the home market with the
 * densest content. Honest framing beats fabricating a "global"
 * variant on real India-rooted data.
 */
export function pickHomeVariant(country: Country): HomeVariant {
  if ((HOME_VARIANT_COUNTRIES as readonly string[]).includes(country)) {
    return HOME_VARIANTS[country as HomeVariantCountry];
  }
  return HOME_VARIANTS.IN;
}

/**
 * Build the hreflang alternates map for the homepage's <head>. Maps
 * each variant's hreflang code to its canonical country URL, plus
 * the x-default fallback (root /).
 */
export function homeAlternates(appUrl: string): Record<string, string> {
  const base = appUrl.replace(/\/$/, "");
  const out: Record<string, string> = {};
  for (const code of HOME_VARIANT_COUNTRIES) {
    const v = HOME_VARIANTS[code];
    out[v.hreflang] = `${base}${v.countryPath}`;
  }
  out["x-default"] = `${base}/`;
  return out;
}
