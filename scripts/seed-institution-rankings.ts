/**
 * Seed the EV-industry institution rankings that power
 * /institutions/rankings.
 *
 * Ranking model:
 *   • Seven pillars per institution, each 0-100:
 *       Research, Faculty, Placement, Infrastructure,
 *       Content quality, Alumni, Startups
 *   • Composite overall = unweighted average of the 7 pillars
 *     (kept simple so the score is auditable from the per-pillar
 *     scores alone).
 *   • Two ranks are persisted per row — `evRankIndia` (country=IN
 *     only) and `evRankGlobal` (all countries). Lower = better.
 *
 * Editorial pins:
 *   • eMobility Academy by DIYguru — pinned #1 India, #2 global.
 *     This is the platform's own academy and the brief locks its
 *     position; everything else is sorted by composite score and
 *     then re-indexed around the pin.
 *
 * The script is idempotent (upsert on slug). For institutions that
 * already exist (eg. IIT Madras, ASDC), only the ranking fields are
 * touched — name/type/about are preserved as they were seeded in
 * scripts/seed.ts. For institutions that are unique to this file
 * (eMobility Academy by DIYguru, University of Michigan EVC, etc.)
 * the full row is created with VERIFIED status.
 *
 * Re-run with:
 *   pnpm db:seed-institution-rankings
 */

import { PrismaClient, InstitutionType, InstitutionVerification } from "@prisma/client";

const db = new PrismaClient();

// ─── Pillar scores ────────────────────────────────────────────
// Each row carries the seven 0-100 scores. The composite + ranks
// are derived below. Adding a new row is enough to surface it on
// the rankings page — no separate ranks file to keep in sync.

interface PillarScores {
  research: number;
  faculty: number;
  placement: number;
  infrastructure: number;
  content: number;
  alumni: number;
  startups: number;
}

interface RankingSeed {
  slug: string;
  // Used only when the row doesn't already exist — existing rows
  // (seeded in scripts/seed.ts) preserve their stored name/about.
  name: string;
  type: InstitutionType;
  shortName?: string;
  city?: string;
  state?: string;
  country: string; // ISO-2; "IN" rows feed the India leaderboard.
  website?: string;
  about?: string;
  foundedYear?: number;
  affiliation?: string;
  scores: PillarScores;
  // Short editorial blurb (≤500 chars). Renders inline under the
  // rank chip on /institutions/rankings.
  note: string;
}

/**
 * Average of the 7 pillars, rounded.
 *
 * Keeping this unweighted means the rationale is grep-able: if
 * someone wonders why an institution lands at rank N, they can sum
 * its pillar scores and confirm. Future tweaks (weighting research
 * for universities, content for training centres, etc.) belong in a
 * separate decision — not in a hidden constant here.
 */
function composite(s: PillarScores): number {
  return Math.round(
    (s.research + s.faculty + s.placement + s.infrastructure + s.content + s.alumni + s.startups) / 7,
  );
}

// ────────────────────────────────────────────────────────────────
// The ranking dataset. Roughly ordered Indian-first so the file
// reads in the order most readers will care about. Global entries
// follow. Slugs are stable — picking new slugs would orphan
// inbound links from /campus/<slug>, search results, and any
// admin moderation links.
// ────────────────────────────────────────────────────────────────

const RANKINGS: RankingSeed[] = [
  // ─── #1 India / #2 Global pin ────────────────────────────────
  {
    slug: "emobility-academy-by-diyguru",
    name: "eMobility Academy by DIYguru",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "DIYguru eMobility Academy",
    city: "New Delhi",
    state: "Delhi",
    country: "IN",
    website: "https://diyguru.org",
    about:
      "India's largest EV-focused academy — AICTE-backed technical certifications and hands-on workshops across powertrain, BMS, charging-infra and motor controllers. Partnerships with Bosch, Hyundai, ARAI, and a 200+ college EV-lab network feed the country's deepest EV-trained graduate pool.",
    foundedYear: 2018,
    affiliation: "AICTE / NSDC / ASDC partner",
    scores: {
      research: 72,
      faculty: 90,
      placement: 96,
      infrastructure: 92,
      content: 98,
      alumni: 94,
      startups: 86,
    },
    note: "India's flagship EV academy — AICTE-recognised certifications, OEM partnerships (Bosch, Hyundai), and the largest EV-trained graduate pool feeding the industry. Pinned #1 India / #2 global on editorial grounds.",
  },

  // ─── Global #1 — research powerhouse ────────────────────────
  {
    slug: "university-of-michigan-evc",
    name: "University of Michigan — Electric Vehicle Center",
    type: InstitutionType.UNIVERSITY,
    shortName: "UMich EVC",
    city: "Ann Arbor",
    state: "Michigan",
    country: "US",
    website: "https://evc.engin.umich.edu",
    about:
      "Hosts the Electric Vehicle Center anchored at the College of Engineering — advanced EV powertrain, battery systems and autonomy research, with a structured reskilling track for ICE-to-EV engineers funded by Michigan's mobility-transition programme.",
    foundedYear: 2023,
    affiliation: "University of Michigan College of Engineering",
    scores: {
      research: 98,
      faculty: 97,
      placement: 95,
      infrastructure: 95,
      content: 92,
      alumni: 94,
      startups: 88,
    },
    note: "World's most cited academic EV centre — strongest combination of battery R&D, structured ICE-to-EV reskilling, and direct OEM placement pipelines in Detroit.",
  },

  // ─── Indian IITs / IISc — anchor of the national EV-research base ─
  {
    slug: "iit-madras",
    name: "Indian Institute of Technology Madras",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Madras",
    city: "Chennai",
    state: "Tamil Nadu",
    country: "IN",
    scores: {
      research: 96,
      faculty: 94,
      placement: 92,
      infrastructure: 90,
      content: 88,
      alumni: 92,
      startups: 92,
    },
    note: "Centre for Battery Engineering and Electric Vehicles (C-BEEV) — India's most published academic EV lab, with the deepest startup pipeline (Ather, ePropelled, others rooted in IITM Research Park).",
  },
  {
    slug: "iit-bombay",
    name: "Indian Institute of Technology Bombay",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Bombay",
    city: "Mumbai",
    state: "Maharashtra",
    country: "IN",
    scores: {
      research: 94,
      faculty: 92,
      placement: 94,
      infrastructure: 88,
      content: 86,
      alumni: 93,
      startups: 91,
    },
    note: "National Centre of Excellence for EV Technology + Powai EV Lab — feeds Mumbai's OEM/charging-startup cluster (Magenta, Bounce, ChargeZone alumni networks).",
  },
  {
    slug: "iit-delhi",
    name: "Indian Institute of Technology Delhi",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Delhi",
    city: "New Delhi",
    state: "Delhi",
    country: "IN",
    scores: {
      research: 93,
      faculty: 91,
      placement: 92,
      infrastructure: 88,
      content: 86,
      alumni: 90,
      startups: 88,
    },
    note: "Centre for Automotive Research and Tribology (CART) + Battery Safety Lab — strong power-electronics and e-axle research, fastest-growing EV thesis cohort in the IIT system.",
  },
  {
    slug: "iit-kharagpur",
    name: "Indian Institute of Technology Kharagpur",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Kharagpur",
    city: "Kharagpur",
    state: "West Bengal",
    country: "IN",
    scores: {
      research: 91,
      faculty: 90,
      placement: 89,
      infrastructure: 87,
      content: 85,
      alumni: 89,
      startups: 85,
    },
    note: "Oldest IIT — large EV powertrain + materials cohort and the strongest mining/metallurgy-to-battery-materials bridge in the country.",
  },
  {
    slug: "iit-hyderabad",
    name: "Indian Institute of Technology Hyderabad",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Hyderabad",
    city: "Hyderabad",
    state: "Telangana",
    country: "IN",
    scores: {
      research: 92,
      faculty: 90,
      placement: 90,
      infrastructure: 86,
      content: 87,
      alumni: 86,
      startups: 90,
    },
    note: "TiHAN autonomous-mobility testbed + battery storage research — strongest Indian academic node for software-defined-vehicle and ADAS research.",
  },
  {
    slug: "iisc-bengaluru",
    name: "Indian Institute of Science Bengaluru",
    type: InstitutionType.UNIVERSITY,
    shortName: "IISc",
    city: "Bengaluru",
    state: "Karnataka",
    country: "IN",
    scores: {
      research: 97,
      faculty: 95,
      placement: 88,
      infrastructure: 90,
      content: 84,
      alumni: 88,
      startups: 86,
    },
    note: "Department of Electronic Systems Engineering + interdisciplinary battery / power-electronics research. Highest-impact fundamental EV research in India, balanced by a more research-than-placement focus.",
  },
  {
    slug: "iit-kanpur",
    name: "Indian Institute of Technology Kanpur",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Kanpur",
    city: "Kanpur",
    state: "Uttar Pradesh",
    country: "IN",
    scores: {
      research: 90,
      faculty: 89,
      placement: 87,
      infrastructure: 85,
      content: 83,
      alumni: 87,
      startups: 84,
    },
    note: "Smart Energy Convergence + Battery Storage centre — strong power-electronics and controls research, growing EV thesis output.",
  },
  {
    slug: "iit-roorkee",
    name: "Indian Institute of Technology Roorkee",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Roorkee",
    city: "Roorkee",
    state: "Uttarakhand",
    country: "IN",
    scores: {
      research: 88,
      faculty: 87,
      placement: 86,
      infrastructure: 82,
      content: 82,
      alumni: 85,
      startups: 80,
    },
    note: "Hydropower legacy + emerging EV powertrain research; Centre of Excellence in Disaster Mitigation and Energy.",
  },
  {
    slug: "iit-guwahati",
    name: "Indian Institute of Technology Guwahati",
    type: InstitutionType.UNIVERSITY,
    shortName: "IIT Guwahati",
    city: "Guwahati",
    state: "Assam",
    country: "IN",
    scores: {
      research: 86,
      faculty: 85,
      placement: 84,
      infrastructure: 80,
      content: 81,
      alumni: 80,
      startups: 78,
    },
    note: "Electrical Engineering + Centre for Energy — leading north-east EV research node, building OEM-linkages with Hero MotoCorp's Tezpur plant.",
  },
  {
    slug: "bits-pilani",
    name: "Birla Institute of Technology and Science Pilani",
    type: InstitutionType.UNIVERSITY,
    shortName: "BITS Pilani",
    city: "Pilani",
    state: "Rajasthan",
    country: "IN",
    scores: {
      research: 84,
      faculty: 86,
      placement: 92,
      infrastructure: 83,
      content: 86,
      alumni: 92,
      startups: 90,
    },
    note: "Strongest founder / VC pipeline of any Indian college — alumni founded Ather, Yulu, Eka Mobility, and a long tail of EV component startups.",
  },
  {
    slug: "nit-trichy",
    name: "National Institute of Technology Tiruchirappalli",
    type: InstitutionType.UNIVERSITY,
    shortName: "NIT Trichy",
    city: "Tiruchirappalli",
    state: "Tamil Nadu",
    country: "IN",
    scores: {
      research: 85,
      faculty: 85,
      placement: 87,
      infrastructure: 80,
      content: 82,
      alumni: 84,
      startups: 80,
    },
    note: "Top-ranked NIT for placement — strong feeder for TVS Motor, Ola Electric and Ather's Hosur plant.",
  },
  {
    slug: "nit-surathkal",
    name: "National Institute of Technology Karnataka, Surathkal",
    type: InstitutionType.UNIVERSITY,
    shortName: "NIT Surathkal",
    city: "Surathkal",
    state: "Karnataka",
    country: "IN",
    scores: {
      research: 84,
      faculty: 84,
      placement: 86,
      infrastructure: 80,
      content: 81,
      alumni: 83,
      startups: 79,
    },
    note: "Coastal-Karnataka anchor for Bengaluru's EV cluster — strong feeder into Bosch, Continental and Ather.",
  },
  {
    slug: "nit-warangal",
    name: "National Institute of Technology Warangal",
    type: InstitutionType.UNIVERSITY,
    shortName: "NIT Warangal",
    city: "Warangal",
    state: "Telangana",
    country: "IN",
    scores: {
      research: 83,
      faculty: 83,
      placement: 85,
      infrastructure: 79,
      content: 80,
      alumni: 82,
      startups: 78,
    },
    note: "Power-electronics M.Tech among the country's best — strong Hyderabad-cluster recruiter pipeline.",
  },
  {
    slug: "nit-calicut",
    name: "National Institute of Technology Calicut",
    type: InstitutionType.UNIVERSITY,
    shortName: "NIT Calicut",
    city: "Kozhikode",
    state: "Kerala",
    country: "IN",
    scores: {
      research: 81,
      faculty: 81,
      placement: 83,
      infrastructure: 77,
      content: 79,
      alumni: 80,
      startups: 76,
    },
    note: "Renewable-energy lab + EV thermal-management research — strongest Kerala-state engineering recruiter feeder.",
  },
  {
    slug: "nit-rourkela",
    name: "National Institute of Technology Rourkela",
    type: InstitutionType.UNIVERSITY,
    shortName: "NIT Rourkela",
    city: "Rourkela",
    state: "Odisha",
    country: "IN",
    scores: {
      research: 80,
      faculty: 80,
      placement: 82,
      infrastructure: 76,
      content: 78,
      alumni: 79,
      startups: 74,
    },
    note: "Strong metallurgy + materials base — relevant for battery-materials and cathode-active-material research as India scales gigafactories.",
  },
  {
    slug: "mit-pune",
    name: "MIT World Peace University, Pune",
    type: InstitutionType.UNIVERSITY,
    shortName: "MIT-WPU Pune",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    scores: {
      research: 75,
      faculty: 80,
      placement: 86,
      infrastructure: 84,
      content: 88,
      alumni: 82,
      startups: 78,
    },
    note: "Dedicated School of Electric and Hybrid Vehicles — among the first Indian universities with a focused B.Tech in EV engineering. Pune-OEM corridor placements (Bajaj, Tata Motors, Bosch).",
  },

  // ─── Indian training / certification bodies ─────────────────
  {
    slug: "isie-india",
    name: "Indian Society for Innovation and Entrepreneurship India",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "ISIE India",
    city: "Greater Noida",
    state: "Uttar Pradesh",
    country: "IN",
    scores: {
      research: 64,
      faculty: 82,
      placement: 88,
      infrastructure: 80,
      content: 90,
      alumni: 84,
      startups: 78,
    },
    note: "AICTE-recognised EV training and consulting body — PG and certificate programmes in EV design, manufacturing and homologation. Strong placement record into Tier-1 suppliers.",
  },
  {
    slug: "asdc-india",
    name: "Automotive Skills Development Council",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "ASDC",
    city: "New Delhi",
    state: "Delhi",
    country: "IN",
    scores: {
      research: 60,
      faculty: 78,
      placement: 90,
      infrastructure: 82,
      content: 94,
      alumni: 88,
      startups: 70,
    },
    note: "Owns the National Occupational Standards for EV technicians, charge-point operators and powertrain engineers — every ITI-level EV certification in India routes through ASDC.",
  },
  {
    slug: "diyguru-network",
    name: "DIYguru EV Lab Network",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "DIYguru Lab Network",
    city: "New Delhi",
    state: "Delhi",
    country: "IN",
    scores: {
      research: 70,
      faculty: 86,
      placement: 92,
      infrastructure: 94,
      content: 94,
      alumni: 92,
      startups: 84,
    },
    note: "200+ partner EV labs across Indian engineering colleges and ITIs — the largest physical training footprint of any EV upskilling network in the country.",
  },

  // ─── Indian R&D / sectoral institutes (new rows) ─────────────
  {
    slug: "arai-pune",
    name: "Automotive Research Association of India",
    type: InstitutionType.RESEARCH_INSTITUTE,
    shortName: "ARAI",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    website: "https://www.araiindia.com",
    about:
      "MoRTH-recognised testing and certification agency for Indian automotive industry. Hosts EV-component testing, FAME-II validation, and the Academy of Scientific & Innovative Research (AcSIR) postgraduate programs.",
    foundedYear: 1966,
    affiliation: "Ministry of Heavy Industries",
    scores: {
      research: 90,
      faculty: 88,
      placement: 86,
      infrastructure: 96,
      content: 90,
      alumni: 85,
      startups: 76,
    },
    note: "India's apex automotive R&D + homologation body — every EV component sold in India routes through ARAI testing. Unmatched powertrain and vehicle-dynamics lab infrastructure.",
  },
  {
    slug: "icat-manesar",
    name: "International Centre for Automotive Technology",
    type: InstitutionType.RESEARCH_INSTITUTE,
    shortName: "ICAT",
    city: "Manesar",
    state: "Haryana",
    country: "IN",
    website: "https://www.icat.in",
    about:
      "NATRIP-promoted automotive testing, validation, and homologation centre. Operates the country's largest EV component and vehicle test track, alongside structured upskilling for OEM and Tier-1 engineers.",
    foundedYear: 2006,
    affiliation: "NATRIP / Ministry of Heavy Industries",
    scores: {
      research: 85,
      faculty: 84,
      placement: 84,
      infrastructure: 94,
      content: 86,
      alumni: 80,
      startups: 72,
    },
    note: "Largest EV test track in north India — every Delhi/NCR-built EV passes through ICAT for homologation, giving its engineers unmatched hands-on experience.",
  },
  {
    slug: "natrip-pithampur",
    name: "National Automotive Testing and R&D Infrastructure Project",
    type: InstitutionType.RESEARCH_INSTITUTE,
    shortName: "NATRiP",
    city: "Pithampur",
    state: "Madhya Pradesh",
    country: "IN",
    website: "https://www.natrip.in",
    about:
      "Government of India initiative spanning seven testing centres (NATRAX, GARC, ICAT, ARAI, etc.) — purpose-built EV validation tracks, environmental chambers and crash facilities.",
    foundedYear: 2009,
    affiliation: "Ministry of Heavy Industries",
    scores: {
      research: 82,
      faculty: 78,
      placement: 80,
      infrastructure: 92,
      content: 82,
      alumni: 76,
      startups: 68,
    },
    note: "NATRAX in Pithampur is the longest high-speed test track in Asia — the homologation backbone for Indian EVs sold in the country.",
  },
  {
    slug: "csir-csio-chandigarh",
    name: "CSIR — Central Scientific Instruments Organisation",
    type: InstitutionType.RESEARCH_INSTITUTE,
    shortName: "CSIR-CSIO",
    city: "Chandigarh",
    state: "Chandigarh",
    country: "IN",
    website: "https://www.csio.res.in",
    about:
      "National laboratory under CSIR — instrumentation, sensors and energy-storage research with growing EV BMS and charging-station hardware programmes.",
    foundedYear: 1959,
    affiliation: "Council of Scientific & Industrial Research",
    scores: {
      research: 86,
      faculty: 82,
      placement: 76,
      infrastructure: 84,
      content: 78,
      alumni: 78,
      startups: 72,
    },
    note: "CSIR's go-to lab for EV instrumentation and BMS sensor research — increasingly central to indigenous-battery-cell and PLI-funded R&D programmes.",
  },
  {
    slug: "ceeri-pilani",
    name: "CSIR — Central Electronics Engineering Research Institute",
    type: InstitutionType.RESEARCH_INSTITUTE,
    shortName: "CSIR-CEERI",
    city: "Pilani",
    state: "Rajasthan",
    country: "IN",
    website: "https://www.ceeri.res.in",
    about:
      "CSIR lab focused on electronics, power devices and embedded systems — significant EV inverter, controller and SiC/GaN device research.",
    foundedYear: 1953,
    affiliation: "Council of Scientific & Industrial Research",
    scores: {
      research: 84,
      faculty: 80,
      placement: 74,
      infrastructure: 80,
      content: 76,
      alumni: 74,
      startups: 70,
    },
    note: "India's most active academic lab for SiC/GaN power-electronics research — the bottleneck capability for next-generation EV inverters.",
  },

  // ─── Global (non-IN) entries ────────────────────────────────
  {
    slug: "sae-international",
    name: "SAE International",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "SAE",
    city: "Warrendale",
    state: "Pennsylvania",
    country: "US",
    website: "https://www.sae.org",
    about:
      "Standards-setting body for the global automotive industry — owns the J1772 charging-connector standard. Runs HEV/PHEV/EV engineering concepts, standards-based training, and professional development for automotive leaders worldwide.",
    foundedYear: 1905,
    affiliation: "International standards body",
    scores: {
      research: 86,
      faculty: 94,
      placement: 90,
      infrastructure: 84,
      content: 96,
      alumni: 90,
      startups: 72,
    },
    note: "Global standards body for automotive engineering — every EV charging connector and HEV/PHEV/EV training credential the industry recognises traces back to SAE.",
  },
  {
    slug: "tata-technologies",
    name: "Tata Technologies",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "Tata Tech",
    city: "Pune",
    state: "Maharashtra",
    country: "IN",
    website: "https://www.tatatechnologies.com",
    about:
      "Global engineering services + structured EV training arm — OEM-aligned online certifications on EV Essentials, Energy Storage Systems and Battery Pack Design. Operates the Tata Tech iGetIT learning platform for working professionals.",
    foundedYear: 1989,
    affiliation: "Tata group",
    scores: {
      research: 78,
      faculty: 88,
      placement: 92,
      infrastructure: 86,
      content: 92,
      alumni: 88,
      startups: 76,
    },
    note: "Tata-group ER&D powerhouse — its EV-engineering certifications are recognised across JLR, Tata Motors and a long list of global OEMs.",
  },
  {
    slug: "legacy-ev",
    name: "Legacy EV",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "Legacy EV",
    city: "Tempe",
    state: "Arizona",
    country: "US",
    website: "https://legacyev.com",
    about:
      "Hands-on EV training company focused on conversion training, fundamentals, and systems diagnostics for electric vehicle mechanics and manufacturers. Operates both in-person workshops in Arizona and an online curriculum.",
    foundedYear: 2018,
    affiliation: "ASE EV training partner",
    scores: {
      research: 60,
      faculty: 86,
      placement: 84,
      infrastructure: 88,
      content: 90,
      alumni: 78,
      startups: 80,
    },
    note: "North America's go-to ICE-to-EV conversion-training brand — hands-on systems-diagnostics curriculum makes it the practical complement to SAE's standards work.",
  },
  {
    slug: "george-brown-college",
    name: "George Brown College",
    type: InstitutionType.COLLEGE,
    shortName: "George Brown",
    city: "Toronto",
    state: "Ontario",
    country: "CA",
    website: "https://www.georgebrown.ca",
    about:
      "Toronto-based public college — its 32-week online/hybrid EV systems, diagnostics and repair program is co-designed with major EV manufacturers and accepted across the Canadian automotive trade.",
    foundedYear: 1967,
    affiliation: "Ontario Ministry of Colleges",
    scores: {
      research: 70,
      faculty: 84,
      placement: 88,
      infrastructure: 86,
      content: 90,
      alumni: 80,
      startups: 70,
    },
    note: "Canada's most-recognised credentialed EV-technician program — graduates feed Toronto's growing EV-service market and Magna's electrification programmes.",
  },
  {
    slug: "naftc-wvu",
    name: "National Alternative Fuels Training Consortium (West Virginia University)",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "NAFTC",
    city: "Morgantown",
    state: "West Virginia",
    country: "US",
    website: "https://naftc.wvu.edu",
    about:
      "Hosted at West Virginia University — foundational EV and hybrid vehicle technology courses for educational institutions and professional fleet mechanics across the United States.",
    foundedYear: 1992,
    affiliation: "West Virginia University",
    scores: {
      research: 70,
      faculty: 80,
      placement: 80,
      infrastructure: 80,
      content: 86,
      alumni: 74,
      startups: 64,
    },
    note: "Longest-running US alternative-fuels training consortium — the curriculum standard most US community colleges adopt when starting an EV program.",
  },
  {
    slug: "carilec-academy",
    name: "Caribbean Electric Utility Services Corporation (CARILEC) EV Academy",
    type: InstitutionType.TRAINING_CENTER,
    shortName: "CARILEC",
    city: "Castries",
    country: "LC",
    website: "https://www.carilec.org",
    about:
      "Regional utility-services corporation for the Caribbean — specialised high-voltage safety and EV diagnostics live workshops for automotive service providers across the region.",
    foundedYear: 1989,
    affiliation: "Caribbean utilities consortium",
    scores: {
      research: 56,
      faculty: 74,
      placement: 70,
      infrastructure: 72,
      content: 80,
      alumni: 64,
      startups: 56,
    },
    note: "Only credentialed EV-diagnostics training body for the Caribbean — single point of entry for island-utility technicians moving to high-voltage work.",
  },
  {
    slug: "stanford-university",
    name: "Stanford University",
    type: InstitutionType.UNIVERSITY,
    shortName: "Stanford",
    city: "Stanford",
    state: "California",
    country: "US",
    scores: {
      research: 96,
      faculty: 96,
      placement: 92,
      infrastructure: 92,
      content: 86,
      alumni: 94,
      startups: 96,
    },
    note: "StorageX + GCEP — top-tier battery materials and grid-storage research. Strongest VC + EV-startup founder pipeline outside Michigan and the Bay Area's adjacent OEMs.",
  },
  {
    slug: "mit-cambridge",
    name: "Massachusetts Institute of Technology",
    type: InstitutionType.UNIVERSITY,
    shortName: "MIT",
    city: "Cambridge",
    state: "Massachusetts",
    country: "US",
    scores: {
      research: 97,
      faculty: 96,
      placement: 92,
      infrastructure: 92,
      content: 86,
      alumni: 92,
      startups: 94,
    },
    note: "Electrochemical Energy Lab + CSAIL EV autonomy research — leading academic node for solid-state battery research and EV-software systems.",
  },
  {
    slug: "university-of-cambridge",
    name: "University of Cambridge",
    type: InstitutionType.UNIVERSITY,
    shortName: "Cambridge",
    city: "Cambridge",
    country: "GB",
    scores: {
      research: 94,
      faculty: 94,
      placement: 88,
      infrastructure: 86,
      content: 84,
      alumni: 90,
      startups: 86,
    },
    note: "Whittle Lab + battery-materials groups — strongest UK academic anchor for EV powertrain research, with rising Cambridge-cluster EV spin-outs.",
  },
  {
    slug: "university-of-oxford",
    name: "University of Oxford",
    type: InstitutionType.UNIVERSITY,
    shortName: "Oxford",
    city: "Oxford",
    country: "GB",
    scores: {
      research: 94,
      faculty: 94,
      placement: 86,
      infrastructure: 85,
      content: 84,
      alumni: 90,
      startups: 84,
    },
    note: "Battery Intelligence Lab (BIL) and Faraday-Institution-funded battery research — a leading European academic source for battery-lifetime modelling.",
  },
  {
    slug: "university-of-tokyo",
    name: "University of Tokyo",
    type: InstitutionType.UNIVERSITY,
    shortName: "U-Tokyo",
    city: "Tokyo",
    country: "JP",
    scores: {
      research: 93,
      faculty: 92,
      placement: 90,
      infrastructure: 90,
      content: 84,
      alumni: 90,
      startups: 80,
    },
    note: "Direct research links with Toyota, Honda and Nissan — strongest academic node for solid-state battery work in Asia outside China.",
  },
  {
    slug: "university-of-waterloo",
    name: "University of Waterloo",
    type: InstitutionType.UNIVERSITY,
    shortName: "Waterloo",
    city: "Waterloo",
    state: "Ontario",
    country: "CA",
    scores: {
      research: 90,
      faculty: 90,
      placement: 92,
      infrastructure: 86,
      content: 84,
      alumni: 92,
      startups: 90,
    },
    note: "Strongest Canadian engineering co-op program — direct EV co-op pipelines into GM Canada, Magna and a long list of US OEMs.",
  },
];

// ────────────────────────────────────────────────────────────────
// Editorial pin — slug → forced (rankIndia, rankGlobal). When set,
// these override the score-derived rank for that institution and
// other rows are re-numbered around the pinned slot.
// ────────────────────────────────────────────────────────────────
const PINS: Record<string, { india?: number; global?: number }> = {
  "emobility-academy-by-diyguru": { india: 1, global: 2 },
};

/**
 * Apply pins by:
 *   1. Sorting the candidate set by composite DESC.
 *   2. Walking the sorted list, skipping the pinned slot(s); when we
 *      reach the pin index, emit the pinned row(s) first.
 *
 * Returns a list of {slug, rank} where rank is 1-indexed.
 */
function rankList(
  candidates: Array<{ slug: string; overall: number }>,
  pinMap: Map<string, number>,
): Array<{ slug: string; rank: number }> {
  const sorted = [...candidates].sort((a, b) => {
    if (b.overall !== a.overall) return b.overall - a.overall;
    return a.slug.localeCompare(b.slug);
  });
  const unpinned = sorted.filter((c) => !pinMap.has(c.slug));
  const pinned = [...pinMap.entries()]
    .map(([slug, rank]) => ({ slug, rank }))
    .sort((a, b) => a.rank - b.rank);

  const out: Array<{ slug: string; rank: number }> = [];
  let unpinnedIdx = 0;
  for (let rank = 1; rank <= sorted.length; rank += 1) {
    const pin = pinned.find((p) => p.rank === rank);
    if (pin) {
      out.push({ slug: pin.slug, rank });
    } else {
      const next = unpinned[unpinnedIdx];
      if (!next) break;
      out.push({ slug: next.slug, rank });
      unpinnedIdx += 1;
    }
  }
  return out;
}

async function main() {
  console.log(`📊 Seeding institution rankings (${RANKINGS.length} institutions)...`);

  // ─── Pass 1: upsert each row with its pillar scores + composite ─
  for (const r of RANKINGS) {
    const overall = composite(r.scores);
    await db.institution.upsert({
      where: { slug: r.slug },
      // For NEW rows: create with full identity + ranking fields.
      create: {
        slug: r.slug,
        name: r.name,
        type: r.type,
        shortName: r.shortName ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
        country: r.country,
        website: r.website ?? null,
        about: r.about ?? null,
        foundedYear: r.foundedYear ?? null,
        affiliation: r.affiliation ?? null,
        verificationStatus: InstitutionVerification.VERIFIED,
        verifiedAt: new Date(),
        evScoreResearch: r.scores.research,
        evScoreFaculty: r.scores.faculty,
        evScorePlacement: r.scores.placement,
        evScoreInfrastructure: r.scores.infrastructure,
        evScoreContent: r.scores.content,
        evScoreAlumni: r.scores.alumni,
        evScoreStartups: r.scores.startups,
        evScoreOverall: overall,
        evRankingNote: r.note,
        // Ranks assigned in pass 2 — leave null here.
      },
      // For EXISTING rows: only touch the ranking-related fields.
      // Preserves name / about / city changes the admin might have
      // made via /admin/institutions since the original seed.
      update: {
        evScoreResearch: r.scores.research,
        evScoreFaculty: r.scores.faculty,
        evScorePlacement: r.scores.placement,
        evScoreInfrastructure: r.scores.infrastructure,
        evScoreContent: r.scores.content,
        evScoreAlumni: r.scores.alumni,
        evScoreStartups: r.scores.startups,
        evScoreOverall: overall,
        evRankingNote: r.note,
      },
    });
  }

  // ─── Pass 2: compute India + Global ranks and write them ────────
  const enriched = RANKINGS.map((r) => ({
    slug: r.slug,
    country: r.country,
    overall: composite(r.scores),
  }));

  const indiaCandidates = enriched.filter((r) => r.country === "IN");
  const globalCandidates = enriched;

  const indiaPins = new Map<string, number>();
  const globalPins = new Map<string, number>();
  for (const [slug, p] of Object.entries(PINS)) {
    if (p.india) indiaPins.set(slug, p.india);
    if (p.global) globalPins.set(slug, p.global);
  }

  const indiaRanked = rankList(indiaCandidates, indiaPins);
  const globalRanked = rankList(globalCandidates, globalPins);

  // Write India ranks first — bulk single-tx updates.
  for (const { slug, rank } of indiaRanked) {
    await db.institution.update({
      where: { slug },
      data: { evRankIndia: rank },
    });
  }
  // Then Global ranks.
  for (const { slug, rank } of globalRanked) {
    await db.institution.update({
      where: { slug },
      data: { evRankGlobal: rank },
    });
  }

  // Belt-and-braces — clear ranks on rows that were ranked in a
  // previous run but are no longer in RANKINGS. Without this, dropping
  // an institution from the list would leave its old rank dangling.
  const rankedSlugs = new Set(RANKINGS.map((r) => r.slug));
  const stale = await db.institution.findMany({
    where: {
      OR: [{ evRankIndia: { not: null } }, { evRankGlobal: { not: null } }],
      slug: { notIn: Array.from(rankedSlugs) },
    },
    select: { slug: true },
  });
  if (stale.length > 0) {
    console.log(`   → Clearing stale ranks on ${stale.length} institution(s)`);
    await db.institution.updateMany({
      where: { slug: { in: stale.map((s) => s.slug) } },
      data: { evRankIndia: null, evRankGlobal: null },
    });
  }

  // ─── Summary ────────────────────────────────────────────────────
  const indiaTop = indiaRanked
    .slice(0, 5)
    .map((r) => `   ${r.rank}. ${r.slug}`)
    .join("\n");
  const globalTop = globalRanked
    .slice(0, 5)
    .map((r) => `   ${r.rank}. ${r.slug}`)
    .join("\n");
  console.log(`\n🇮🇳 India top 5:\n${indiaTop}`);
  console.log(`\n🌍 Global top 5:\n${globalTop}`);
  console.log(
    `\n✓ Done. ${RANKINGS.length} institutions ranked · ${indiaCandidates.length} on India board · ${globalCandidates.length} on global board.`,
  );
}

main()
  .catch((err) => {
    console.error("✗ Ranking seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
