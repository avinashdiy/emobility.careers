/**
 * Seed 50 SEO-tuned EV-career blog articles.
 *
 * Each article is upserted by slug. Re-running is safe — admin
 * edits to bodies NOT in this seed are untouched, edits to bodies
 * IN this seed are overwritten on re-run (so the seed is the source
 * of truth for the canonical evergreen articles).
 *
 * Permalink shape: every article is reachable at
 *   https://emobility.careers/<slug>
 * (the legacy `/articles/<slug>` URL 308s to the root permalink —
 * see app/articles/[slug]/page.tsx).
 *
 * Each article follows the same structural recipe:
 *   • SEO-rich title (60-70 chars)
 *   • 1-line excerpt that doubles as meta description (≤160 chars)
 *   • Lead paragraph
 *   • 3-7 H2 sections — each a few sentences + optional bullet list
 *   • Closing conclusion paragraph
 *   • Standing CTA paragraph (links to /signup + diyguru.org/courses)
 *   • Tags array
 *
 * The HTML is plain semantic markup so the existing `prose` Tailwind
 * typography pipeline renders it correctly without further work.
 *
 * Author attribution: rows are attributed to the first ADMIN user.
 * Categories are auto-created on first run.
 *
 * Run with:
 *   pnpm db:seed-articles
 */

import { PrismaClient, ArticleStatus } from "@prisma/client";

const db = new PrismaClient();

// ─── Category bootstrap ───────────────────────────────────────
// Five evergreen categories that cover the SEO surface. Sort order
// drives the /articles index display order.
const CATEGORIES = [
  { slug: "ev-careers", name: "EV Careers", description: "Career paths, role guides and how to break into the EV industry", sortOrder: 10 },
  { slug: "ev-salary", name: "Salary Insights", description: "What roles pay across the EV industry in India and globally", sortOrder: 20 },
  { slug: "ev-interview-prep", name: "Interview Prep", description: "Question banks, frameworks and prep playbooks for EV interviews", sortOrder: 30 },
  { slug: "ev-skills-training", name: "Skills & Training", description: "Courses, certifications and skill roadmaps for EV professionals", sortOrder: 40 },
  { slug: "ev-networking", name: "Networking & Mentorship", description: "Build your network, find mentors and grow your reputation", sortOrder: 50 },
  { slug: "ev-industry-trends", name: "Industry Trends", description: "Hiring trends, company spotlights and what the EV economy looks like", sortOrder: 60 },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]["slug"];

// ─── Body builder ─────────────────────────────────────────────

interface Section {
  h2: string;
  paragraphs?: string[];
  bullets?: string[];
}

interface ArticleSpec {
  slug: string;
  title: string;
  excerpt: string;
  categorySlug: CategorySlug;
  tags: string[];
  lead: string;
  sections: Section[];
  conclusion: string;
}

/** Escape any incidental `<` `>` `&` in plain copy. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the article body HTML. Renders:
 *   • lead paragraph (.lead — the `prose` plugin styles it larger)
 *   • each section as <h2> + <p>s + optional <ul><li>s
 *   • a final "Where to go from here" H2 with the conclusion
 *   • a standing CTA paragraph pointing to /signup + diyguru.org
 *
 * Word-count targets land in the 500-1000 range automatically as
 * long as the spec has 3+ sections with a couple of paragraphs or a
 * bullet list each.
 */
function buildBody(spec: ArticleSpec): string {
  const parts: string[] = [];
  parts.push(`<p class="lead">${esc(spec.lead)}</p>`);

  for (const s of spec.sections) {
    parts.push(`<h2>${esc(s.h2)}</h2>`);
    if (s.paragraphs) {
      for (const p of s.paragraphs) parts.push(`<p>${esc(p)}</p>`);
    }
    if (s.bullets && s.bullets.length > 0) {
      parts.push("<ul>");
      for (const b of s.bullets) parts.push(`<li>${esc(b)}</li>`);
      parts.push("</ul>");
    }
  }

  parts.push("<h2>Where to go from here</h2>");
  parts.push(`<p>${esc(spec.conclusion)}</p>`);

  // Standing CTA — every article ends here. Drives the two business
  // outcomes: sign-up (broad funnel) and DIYguru course enrolment
  // (revenue funnel). Uses bare anchors so the prose plugin styles
  // them. The buttoned version of this same CTA also renders inside
  // ArticleDetailBody right under the body, so we double up.
  parts.push(
    `<p><strong>Make this real:</strong> ` +
      `<a href="/signup">create a free emobility.careers account</a> ` +
      `to match with EV jobs, see live salary medians and unlock 200+ ` +
      `JD templates. Want hands-on training? Check out the ` +
      `<a href="https://diyguru.org/courses" target="_blank" rel="noopener noreferrer">` +
      `AICTE-approved EV programs at DIYguru</a> — the largest EV academy ` +
      `in India with placement support across OEMs, charging operators and ` +
      `Tier-1 suppliers.</p>`,
  );

  return parts.join("\n");
}

/** Word-count estimator for `readingTimeMins`. */
function wordCount(html: string): number {
  return html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

// ─── 50 articles ──────────────────────────────────────────────
// Each one is an evergreen, India-default, SEO-tuned post. The
// builder fills out the standard CTA + structure; only the spec
// changes per article.

const ARTICLES: ArticleSpec[] = [
  // ═══ EV Careers (12) ════════════════════════════════════════
  {
    slug: "top-10-highest-paying-jobs-in-electric-vehicle-industry-india",
    title: "Top 10 Highest-Paying Jobs in the Electric Vehicle Industry (India 2026)",
    excerpt:
      "From battery cell engineers to EV CTOs — here are the ten roles paying the most in India's EV industry, with salary bands and where to find them.",
    categorySlug: "ev-salary",
    tags: ["EV jobs", "EV salary", "battery engineer", "EV careers", "highest paying jobs"],
    lead:
      "India's electric-vehicle industry has moved from a curiosity into one of the country's most aggressive talent markets. As gigafactories come online, charging networks expand and OEMs accelerate their EV portfolios, a clear hierarchy of high-paying roles has emerged. Here are the ten roles paying the most in 2026 — and what it takes to land them.",
    sections: [
      {
        h2: "1. Chief Technology Officer (EV)",
        paragraphs: [
          "EV CTOs lead engineering organisations across battery, motor, vehicle integration and software. CTC routinely lands in the ₹1.2–2.5 Cr range at growth-stage OEMs and ₹2–4 Cr with ESOPs at venture-backed cell or charging companies.",
          "Candidates have 18+ years of experience, with at least one ICE-to-EV transformation under their belt. Strong external presence — speaking at SAE, ARAI and government policy forums — is part of the job.",
        ],
      },
      {
        h2: "2. Head of Battery Engineering",
        paragraphs: [
          "The senior-most technical authority on the company's most strategic subsystem. CTC ranges from ₹80 L to ₹2 Cr depending on whether the role is at an OEM, cell manufacturer or a venture-funded battery startup.",
        ],
      },
      {
        h2: "3. Power Electronics Architect",
        paragraphs: [
          "Architects who can design 400V or 800V traction inverters with SiC MOSFETs are the rarest commodity in the Indian EV labour market. CTC bands sit at ₹55 L–1.4 Cr for principal-level roles.",
        ],
      },
      {
        h2: "4. Battery Cell Engineer",
        paragraphs: [
          "Senior cell engineers with electrochemistry depth — formulation, formation, characterisation — land between ₹35 L and ₹80 L in India's growing cell manufacturing ecosystem.",
        ],
      },
      {
        h2: "5. BMS Firmware Engineer (Senior / Lead)",
        paragraphs: [
          "Lead BMS firmware engineers with shipped products land ₹35 L–₹75 L. ISO 26262 ASIL-D experience adds a clean 20% premium.",
        ],
      },
      {
        h2: "6. EV Functional Safety Engineer (ISO 26262)",
        paragraphs: [
          "Lead ISO 26262 engineers earn ₹40 L–₹90 L. The role is critical and supply-constrained — every EV OEM and Tier-1 supplier in India is hiring for it.",
        ],
      },
      {
        h2: "7. EV Plant Head (Manufacturing)",
        paragraphs: [
          "Plant heads at greenfield EV facilities earn ₹80 L–₹2 Cr. The role carries P&L accountability for ramps that span billions of rupees of capex.",
        ],
      },
      {
        h2: "8. EV Cybersecurity Engineer (ISO 21434)",
        paragraphs: [
          "Senior vehicle-cybersecurity engineers earn ₹35 L–₹75 L. UN R155 / R156 compliance has made the role unavoidable for exported vehicles.",
        ],
      },
      {
        h2: "9. Cell Manufacturing Process Engineer",
        paragraphs: [
          "Senior process engineers with mixing / coating / formation expertise are hired at ₹25 L–₹55 L by Reliance, Ola, Exide and Amara Raja as they scale gigafactories.",
        ],
      },
      {
        h2: "10. EV Data Scientist (Battery Analytics)",
        paragraphs: [
          "ML engineers who can model battery health, range and warranty exposure command ₹30 L–₹70 L. Strong electrochemistry intuition + ML rigour is the rare combination.",
        ],
      },
    ],
    conclusion:
      "If you're moving into the EV industry from IT, traditional automotive or core engineering, prioritise the roles where India has structural shortage — battery, BMS, power electronics and functional safety. The salary premium for those roles will hold for at least the next five years.",
  },

  {
    slug: "how-to-start-a-career-in-electric-vehicle-industry-2026",
    title: "How to Start a Career in the Electric Vehicle Industry — Roadmap for 2026",
    excerpt:
      "A practical 90-day roadmap to land your first EV-industry role — pick a track, skill up, build a portfolio and apply right.",
    categorySlug: "ev-careers",
    tags: ["EV career", "EV jobs", "career change", "career roadmap", "DIYguru"],
    lead:
      "The EV industry is hiring at pace, but most newcomers stall in the first 30 days because they try to learn everything. The fastest way in is to pick one track, build evidence in 90 days, and target your applications. Here's the playbook that actually works.",
    sections: [
      {
        h2: "Step 1 — Pick a track (week 1)",
        paragraphs: [
          "The EV industry has six broad tracks: battery (cells, packs, BMS), powertrain (motor, inverter, controller), charging (hardware, software, deployment), vehicle integration, manufacturing and service / after-sales.",
          "Pick one based on what your existing skills map to. ICE mechanics map to service. IT engineers map to embedded software or cloud. Mechanical engineers map to battery pack, manufacturing or vehicle integration. Don't dabble across three tracks — you'll look like a tourist on every CV.",
        ],
      },
      {
        h2: "Step 2 — Skill up (weeks 2-8)",
        paragraphs: [
          "Spend the next six weeks closing the specific skills gap in your chosen track. For battery, that means cell chemistry fundamentals, BMS basics and pack design. For powertrain, it's motor control, inverter design and AUTOSAR. For charging, it's OCPP, EVSE design and site engineering.",
          "Take one structured course — AICTE-approved DIYguru programs, SAE certifications or NSDC-aligned ASDC courses are the most-recognised options. Skip generic Coursera unless it's specifically vendor-led (NPTEL, TI, Infineon, Bosch academy).",
        ],
      },
      {
        h2: "Step 3 — Build a portfolio (weeks 6-10)",
        paragraphs: [
          "Hiring managers in EV look for evidence over claims. Build one project that demonstrates your chosen track: a Simulink BMS model, a coin-cell aging study, an EVSE simulator on a Raspberry Pi or a CAN-bus analysis of a 2W EV.",
          "Document everything on GitHub or LinkedIn. A README with photos, schematics and a one-paragraph summary outperforms any certificate.",
        ],
      },
      {
        h2: "Step 4 — Apply right (weeks 9-12)",
        paragraphs: [
          "Most applicants spray and pray. The 10x candidates target 20-30 companies, customise CV per role, and use referrals.",
        ],
        bullets: [
          "Match each application to a specific job description (or use one of the 200+ JD templates on emobility.careers).",
          "Tailor the CV to mirror the JD's keywords — battery, BMS, OCPP, ISO 26262.",
          "Find a referrer at the target company via LinkedIn — even a junior employee referral lifts callback rates 5-10x.",
          "Apply through the company's career page first, then follow up with the recruiter on LinkedIn.",
        ],
      },
      {
        h2: "Step 5 — Interview prep",
        paragraphs: [
          "Final-stage EV interviews mix fundamentals (electrochemistry, FOC, AIS 156), behavioural (Why EVs? Why this company?) and project deep-dives. Practise specific question banks for your track and rehearse your project pitch until it's 5 minutes long and unwasted.",
        ],
      },
    ],
    conclusion:
      "Most candidates underestimate how achievable an EV career change is in 90 days — and overestimate how much depth they need on day one. Pick a track this week, start one course tomorrow, and ship one project by week 10. You'll be ahead of 90% of the applicant pool.",
  },

  {
    slug: "ev-jobs-for-mechanical-engineers-12-career-paths",
    title: "EV Jobs for Mechanical Engineers — 12 Career Paths That Pay Well",
    excerpt:
      "Mechanical engineers have more EV-industry options than they realise. Here are 12 tracks — from battery pack design to NVH — with salary bands and skill maps.",
    categorySlug: "ev-careers",
    tags: ["mechanical engineer EV jobs", "EV careers", "battery pack engineer", "NVH", "thermal engineer"],
    lead:
      "Mechanical engineers entering the EV industry often assume they're locked out of the high-paying technical tracks. Wrong. Most of the structural mechanical engineering inside an EV — pack enclosure, motor housing, chassis, thermal loop, crash performance — is core mechanical work, just with HV awareness layered on top.",
    sections: [
      {
        h2: "1. Battery Pack Mechanical Engineer",
        paragraphs: [
          "Designs the pack enclosure, mounting brackets, cell holders, vent paths and busbars. Heavy CAD (CATIA / NX) and FEA work. Salary band: ₹12-30 L mid-career.",
        ],
      },
      {
        h2: "2. Battery Thermal Engineer",
        paragraphs: [
          "Owns cooling-plate design, refrigerant loops and HVAC integration. CFD-heavy. Salary band: ₹15-32 L.",
        ],
      },
      {
        h2: "3. EV Chassis Engineer",
        paragraphs: [
          "Designs the EV-specific skateboard chassis that accommodates a floor-mounted pack. Salary band: ₹18-40 L senior.",
        ],
      },
      {
        h2: "4. EV NVH Engineer",
        paragraphs: [
          "Reduces gear whine, inverter noise and road / wind noise. EVs are quiet on the engine side which makes every other noise audible. Salary band: ₹12-30 L.",
        ],
      },
      {
        h2: "5. EV Crash Safety Engineer",
        paragraphs: [
          "Owns Bharat NCAP performance with the constraint of a structural battery pack. Heavy LS-DYNA work. Salary band: ₹20-45 L.",
        ],
      },
      {
        h2: "6-12. The rest in brief",
        bullets: [
          "EV Aero / CFD Engineer — drag-coefficient optimisation for range, ₹18-40 L.",
          "Motor Mechanical Engineer — bearings, rotor balancing, shaft design, ₹12-25 L.",
          "Manufacturing Engineer (EV plant) — line balancing, tooling, ramp-up, ₹12-25 L.",
          "EV Tooling Engineer — fixtures, jigs, poke-yoke, ₹10-22 L.",
          "EV Maintenance Engineer (plant) — PLC, robotics, predictive maintenance, ₹12-25 L.",
          "EV Test Engineer — vehicle-level dyno + durability, ₹10-22 L.",
          "EV Standards & Homologation Engineer — ARAI / ICAT test campaigns, ₹15-32 L.",
        ],
      },
      {
        h2: "How to get started",
        paragraphs: [
          "If your CV is heavy on ICE engine or transmission design, lean into pack mechanical or thermal — the closest skill transfer. A 12-week course in EV powertrain fundamentals plus one personal project (e.g. a simple pack 3D model with thermal simulation) opens conversations with most OEMs.",
        ],
      },
    ],
    conclusion:
      "The EV industry is short on mechanical engineers who understand HV safety and battery thermals. If you can demonstrate even basic competence in those two areas, you'll land interviews faster than expected.",
  },

  {
    slug: "ev-jobs-for-electrical-electronics-engineers",
    title: "EV Jobs for Electrical & Electronics Engineers — Where the Money Is",
    excerpt:
      "Electrical and electronics engineers have the deepest demand of any branch in India's EV industry. Here's where to focus and what each role pays.",
    categorySlug: "ev-careers",
    tags: ["electrical engineer EV", "electronics engineer", "power electronics", "BMS", "EV careers"],
    lead:
      "If you trained as an electrical or electronics engineer, you've landed in the EV industry's most under-supplied talent segment. Every OEM, Tier-1, charging operator and battery startup is hiring across power electronics, BMS, motor control, charging hardware and embedded systems. Here's how to pick where to focus.",
    sections: [
      {
        h2: "Power electronics — the rarest and best-paid",
        paragraphs: [
          "Traction inverters, on-board chargers, DC-DC converters and DC fast chargers all need engineers who understand SiC and GaN devices, gate-driver design, magnetics and thermal management. Senior roles pay ₹35-90 L; principal-level architects land ₹55 L-1.4 Cr.",
        ],
      },
      {
        h2: "BMS hardware + firmware",
        paragraphs: [
          "BMS engineers split into hardware (analog front-end, isolation, MCU board) and firmware (state estimation, balancing, ISO 26262 safety). Both tracks pay ₹15-75 L depending on seniority. ISO 26262 ASIL-D experience adds a clean 20% premium.",
        ],
      },
      {
        h2: "Motor design and control",
        paragraphs: [
          "Motor designers run Ansys Maxwell / JMAG simulations and partner with manufacturers on stator and rotor geometry. Motor control engineers implement FOC, MTPA and field-weakening on automotive MCUs. Both pay ₹12-50 L.",
        ],
      },
      {
        h2: "Charging hardware",
        paragraphs: [
          "AC / DC / MCS charger designers earn ₹20-60 L. CCS-2 and ISO 15118 plug-and-charge expertise is increasingly the differentiator.",
        ],
      },
      {
        h2: "Embedded software",
        paragraphs: [
          "Embedded engineers work on VCU, telematics gateway, BMS firmware and ECU integration. AUTOSAR + C / C++ + CAN tooling = ₹12-55 L depending on level.",
        ],
      },
      {
        h2: "How to position yourself",
        bullets: [
          "Pick power electronics, BMS or motor control as primary depth.",
          "Add CAN / AUTOSAR and ISO 26262 fundamentals as secondary.",
          "Build a portfolio project — Simulink BMS model, FOC simulation, or a SiC vs Si converter comparison.",
          "Target Tier-1 suppliers (Bosch, Continental, KPIT, Tata Elxsi) for structured training and OEM exposure.",
        ],
      },
    ],
    conclusion:
      "Electrical and electronics engineers are the most-courted profile in India's EV market. Pick one of these tracks and stick with it for 24 months — you'll come out as a high-leverage senior in a market that's still expanding 30%+ per year.",
  },

  {
    slug: "ev-jobs-for-diploma-iti-graduates",
    title: "EV Jobs for Diploma and ITI Graduates — Blue & Grey Collar Roles",
    excerpt:
      "Diploma and ITI graduates are the workforce backbone of India's EV industry. Here are 15 high-demand roles, what they pay and how to get hired.",
    categorySlug: "ev-careers",
    tags: ["ITI EV jobs", "diploma EV jobs", "EV technician", "blue collar EV", "ASDC"],
    lead:
      "India's EV economy will add a million jobs by 2030, and the majority of those will be filled by diploma and ITI graduates. The pay is competitive, the training pipelines are subsidised, and the work is varied — from cell-line operation to charging-station service.",
    sections: [
      {
        h2: "Top 15 ITI / diploma roles",
        bullets: [
          "EV Charging Station Installer — ₹2.4-6 L / yr, critical demand",
          "EV Charging Service Technician — ₹3.5-9 L / yr",
          "EV 2W / 3W / 4W Service Technician — ₹2.5-9 L / yr depending on category",
          "Battery Assembly Operator — ₹2.4-4.5 L / yr",
          "Battery Pack Assembler — ₹3.5-6.5 L / yr",
          "Battery Module Laser-Welder Operator — ₹3.5-6.5 L / yr",
          "EV Motor Winding Operator — ₹3.5-6 L / yr",
          "Wire Harness Assembler — ₹2.4-4.5 L / yr",
          "Battery Swap Station Operator — ₹2.4-4 L / yr",
          "Battery Recycling Plant Operator — ₹3.5-6.5 L / yr",
          "EV Bus Fleet Mechanic — ₹5-12 L / yr at STUs",
          "EV Quality Line Inspector — ₹3.5-7 L / yr",
          "EV Test Driver (Durability) — ₹5-10 L / yr at proving grounds",
          "PDI Technician — ₹3-6 L / yr at dealerships",
          "Roadside Assistance Technician — ₹3-6 L / yr",
        ],
      },
      {
        h2: "Best courses to qualify",
        paragraphs: [
          "ASDC-aligned EV technician programs (Level 3-5 NSQF) are the gold standard. DIYguru runs 200+ certified EV labs across Indian colleges and ITIs and is the largest single source of EV-trained technician supply.",
          "OEM-specific certifications add a hiring premium — Tata Motors Academy, Mahindra Skill Centre, Hero MotoCorp Skill Centre and Ather Service Academy all run programs that route directly into their service networks.",
        ],
      },
      {
        h2: "How to land your first role",
        bullets: [
          "Complete an ASDC Level 3 or 4 certificate (typically 3-6 months).",
          "Add one OEM-issued certification if you can — Tata, Mahindra, Ather, Ola.",
          "Apply through the company's local service centre, dealer or DIYguru placement cell.",
          "Showcase any practical project — even servicing a 2W EV scooter under supervision counts.",
        ],
      },
    ],
    conclusion:
      "ITI and diploma graduates are the most-recruited segment in India's EV workforce. Get certified, get one OEM badge and you'll have multiple offers within 90 days of completion.",
  },

  {
    slug: "ev-jobs-for-mba-graduates",
    title: "EV Jobs for MBA Graduates — Where MBAs Win in the EV Economy",
    excerpt:
      "MBAs add value across product, sales, supply chain, strategy and finance in the EV industry. Here's where the highest-impact roles sit.",
    categorySlug: "ev-careers",
    tags: ["MBA EV jobs", "EV product manager", "EV strategy", "EV sales", "EV careers"],
    lead:
      "EV companies hire MBAs into product management, strategy, B2B sales, supply chain, brand, finance and HR. The structurally interesting roles tend to combine deep technical context with the commercial work MBAs are trained for. Here are the categories worth targeting.",
    sections: [
      {
        h2: "Product Management",
        paragraphs: [
          "Vehicle, charging, battery and mobile-app PM roles are where MBAs with engineering backgrounds command the steepest premium. CTC bands: ₹25-90 L depending on seniority. Strong fit for IIM/ISB candidates with prior engineering experience.",
        ],
      },
      {
        h2: "Corporate Strategy & M&A",
        paragraphs: [
          "Tata Motors EV, Mahindra Electric, Ola Electric and most growth-stage EV companies have CEO-direct strategy teams running market sizing, partnership origination and M&A pipeline. CTC bands: ₹35 L-1.2 Cr.",
        ],
      },
      {
        h2: "B2B Sales (Fleet, Government, Tier-1)",
        paragraphs: [
          "Fleet sales managers, government tender leads (STU sales for buses), Tier-1 BD roles all carry strong MBA pull. CTC bands: ₹25-80 L with quota-linked variable. EV-specific TCO selling matters more than ICE-style relationship selling.",
        ],
      },
      {
        h2: "Supply Chain & Procurement",
        paragraphs: [
          "Cell procurement, magnet sourcing and battery raw-material strategy are MBA-friendly roles with geopolitical edge. CTC bands: ₹30-90 L for senior roles at OEMs and cell makers.",
        ],
      },
      {
        h2: "Marketing & Brand",
        paragraphs: [
          "EV brand and performance marketing roles attract MBAs who blend product depth with creative execution. CTC bands: ₹25-70 L.",
        ],
      },
      {
        h2: "Finance, HR, Legal",
        paragraphs: [
          "FP&A managers (₹20-50 L), HRBPs (₹25-60 L) and Legal Counsel (₹25-65 L) are standard MBA tracks with EV-specific spice: PLI / FAME modelling for FP&A, ESOPs for HRBPs, dealer / supplier contracts for Legal.",
        ],
      },
    ],
    conclusion:
      "MBAs who pair business chops with EV-domain literacy (battery, charging, motor, software) get the strongest offers. Spend 4-8 weeks reading the technical fundamentals before you target EV roles — it doubles the quality of your interview conversations.",
  },

  {
    slug: "ev-careers-without-a-degree",
    title: "EV Careers Without a Degree — Real Roles, Real Salaries",
    excerpt:
      "You don't need a degree to build a career in the EV industry. Here are the roles, the certifications that count and what they actually pay.",
    categorySlug: "ev-careers",
    tags: ["EV jobs no degree", "ITI EV jobs", "EV technician", "ASDC certification"],
    lead:
      "The fastest-growing segment of India's EV workforce — service technicians, charging-station installers, battery operators — doesn't need a degree. What it needs is structured certification, hands-on training and the right entry point. Here's how to build a career.",
    sections: [
      {
        h2: "Roles that don't need a degree",
        bullets: [
          "Charging station installer and service technician",
          "Two-wheeler and three-wheeler EV service technician",
          "Battery assembly line operator",
          "Battery swap station operator",
          "EV warehouse and logistics handler",
          "EV PDI and final inspection technician",
          "Battery recycling plant operator",
          "EV roadside assistance technician",
        ],
      },
      {
        h2: "Certifications that actually count",
        paragraphs: [
          "ASDC (Automotive Skills Development Council) runs the National Occupational Standards for EV technician roles. Their Level 3-5 NSQF-aligned certifications are recognised across every OEM dealer network and most major service operators.",
          "DIYguru is the largest EV academy in India with 200+ partner labs and AICTE-approved certifications. Their EV powertrain, BMS and charging-infra courses route directly into placement at Tata Motors, Mahindra, Hero MotoCorp, Ather, Ola Electric and more.",
        ],
      },
      {
        h2: "Realistic earnings",
        paragraphs: [
          "Entry-level roles start at ₹2-3.5 L / year. Two to three years of experience plus an OEM-issued certification puts you in the ₹4.5-8 L band. Senior service technicians and team leads earn ₹8-14 L. Workshop managers — typically 5-10 years in — clear ₹15 L+.",
        ],
      },
      {
        h2: "The fastest path in",
        bullets: [
          "Pick one category (2W service, charging install, battery assembly) and complete an ASDC Level 4 certificate.",
          "Add one OEM-specific badge (Tata, Mahindra, Ather, Ola, Hero).",
          "Apply through the DIYguru placement cell or directly to your local dealer / service centre.",
          "After 2 years on-job, take Level 5 / supervisor-level training and target a workshop-lead role.",
        ],
      },
    ],
    conclusion:
      "Degree-less candidates have more leverage in the EV industry than in most other sectors. The right certifications convert into stable work and steady advancement. Pick your track, get certified, and apply through the right channel.",
  },

  {
    slug: "switching-from-it-to-ev-software-engineer-playbook",
    title: "Switching from IT to EV — A Software Engineer's Playbook",
    excerpt:
      "You're a Java / Python / JavaScript engineer who wants into EV. Here's the practical 90-day plan to land your first EV software role.",
    categorySlug: "ev-careers",
    tags: ["IT to EV", "software engineer", "embedded", "career switch", "EV software"],
    lead:
      "Hundreds of Indian IT engineers ask each month how to move into the EV industry. The good news: EV companies need software engineers across cloud, mobile, data and embedded. The bad news: most resumes from generic web / app backgrounds get auto-rejected because they don't speak the language. Here's the 90-day playbook to fix that.",
    sections: [
      {
        h2: "Pick your software lane",
        paragraphs: [
          "EV software splits into four major lanes: embedded (firmware on ECUs), cloud / backend (connected-car platforms, charging CMS), mobile (driver / fleet apps) and data (battery analytics, MLOps). Pick one and commit. The pay and learning curve are roughly equivalent — the entry difficulty differs.",
        ],
      },
      {
        h2: "Fastest lanes for IT engineers",
        bullets: [
          "Cloud / backend — easiest transition for Java / Go / Node engineers. Add MQTT, Kafka and time-series databases.",
          "Mobile — easy for Android / iOS engineers. Add MQTT, Bluetooth pairing and offline-first patterns.",
          "Data / MLOps — easy for Python engineers. Add time-series ML, anomaly detection and battery basics.",
          "Embedded — hardest transition. Requires C / C++, RTOS basics, CAN-bus exposure. Plan 6-12 months of effort.",
        ],
      },
      {
        h2: "Skill up in 60 days",
        paragraphs: [
          "Pick one structured course in your chosen lane. For cloud, OCPP and MQTT fundamentals plus a hands-on charger simulator. For mobile, build a Kotlin / SwiftUI app that pairs over BLE with an ESP32. For data, work through battery cycler datasets on Kaggle. For embedded, run through TI C2000 or NXP S32K tutorials.",
        ],
      },
      {
        h2: "Ship one portfolio project",
        paragraphs: [
          "Build something demoable: an OCPP simulator in TypeScript, a BLE-paired EV companion app, a battery SOH model trained on cycler data, or a Simulink BMS model on a Raspberry Pi. Push to GitHub with a README that explains the EV context.",
        ],
      },
      {
        h2: "Target the right companies",
        paragraphs: [
          "Tier-1 engineering services (KPIT, Tata Elxsi, L&T Technology Services, HCLTech) hire IT-to-EV switchers in bulk. They train you, give you OEM exposure and pay competitively. After 18-24 months you can move to an OEM directly.",
          "Direct-to-OEM works too, but only with a clear portfolio. Ather, Ola, Tata Motors EV and Bolt.Earth all hire mid-level software engineers who can show EV-relevant projects.",
        ],
      },
    ],
    conclusion:
      "Most IT-to-EV switchers don't get rejected on raw skill — they get rejected on positioning. Pick a lane, ship a project, customise your CV per role and target the right entry points. Three months is enough.",
  },

  {
    slug: "switching-from-automotive-to-ev-ice-engineer-reskill",
    title: "Switching from Automotive to EV — How ICE Engineers Reskill",
    excerpt:
      "From engine, transmission or chassis to battery, motor or BMS. A reskilling roadmap for ICE engineers moving into the EV industry.",
    categorySlug: "ev-careers",
    tags: ["ICE to EV", "automotive to EV", "reskilling", "career switch", "EV careers"],
    lead:
      "Engine, transmission and exhaust engineers are watching their roles consolidate. EV companies are hiring — but the skills don't transfer one-for-one. Here's the practical reskilling map for ICE engineers planning a 6-12 month transition.",
    sections: [
      {
        h2: "Map your ICE role to an EV role",
        bullets: [
          "Engine designer → Battery cell or pack engineer",
          "Transmission engineer → Motor design or motor-control engineer",
          "Powertrain controls engineer → VCU or BMS firmware engineer",
          "Calibration engineer → Battery validation or motor calibration engineer",
          "Chassis engineer → EV skateboard chassis engineer (closest 1:1 map)",
          "NVH engineer → EV NVH engineer (the gear-whine / inverter-noise market is hot)",
          "Manufacturing engineer → EV manufacturing engineer (transfers easily)",
          "Service engineer → EV service engineer (after OEM-issued HV certification)",
        ],
      },
      {
        h2: "The fundamentals you need",
        paragraphs: [
          "Electrochemistry basics, HV safety (LOTO, isolation testing, PPE), BMS architecture, motor control (FOC, MTPA), charging standards (CCS-2, OCPP). Add ISO 26262 functional safety if your target role is engineering-heavy. AUTOSAR if you're targeting software.",
        ],
      },
      {
        h2: "Where to learn",
        paragraphs: [
          "AICTE-approved DIYguru programs in EV powertrain, BMS and battery design are the most-recognised reskill route in India. ARAI Academy runs short courses in EV homologation and testing. SAE India offers HEV / PHEV / EV engineering certifications.",
        ],
      },
      {
        h2: "Use your ICE experience as leverage",
        paragraphs: [
          "Engine and powertrain veterans get a clean hiring premium when they pair existing domain depth with EV literacy. OEMs prefer hiring a 10-year ICE veteran with 12 weeks of EV training over a fresh EV-only graduate. Lean into your existing scar tissue around manufacturability, supplier negotiation, NVH, durability — that knowledge transfers.",
        ],
      },
    ],
    conclusion:
      "The ICE-to-EV transition takes 6-12 months done right. Pick one EV adjacent skill (battery, motor, BMS), complete a structured course, build a portfolio piece, and target OEMs and Tier-1s where your prior experience makes you the obvious hire.",
  },

  {
    slug: "remote-ev-jobs-india",
    title: "Remote EV Jobs in India — Where to Find Them and What They Pay",
    excerpt:
      "The EV industry has more remote-friendly roles than you'd expect. Here are the categories that hire remote, the companies that offer it, and the salary trade-off.",
    categorySlug: "ev-careers",
    tags: ["remote EV jobs", "WFH EV", "EV careers", "remote engineering"],
    lead:
      "EV manufacturing and service roles need to be on-site, but software, data, design, marketing, sales-ops, content and product-management roles are increasingly remote in India's EV industry. Here's where to find them and what to expect.",
    sections: [
      {
        h2: "Remote-friendly role categories",
        bullets: [
          "Embedded / cloud / mobile software engineers (hybrid; 2 days office, 3 remote is common)",
          "Data scientists and ML engineers (full remote at startups)",
          "Product managers (hybrid)",
          "UX and visual designers (full remote)",
          "Performance marketing, content marketing, SEO (full remote)",
          "Customer success and sales operations (hybrid)",
          "Recruitment (remote-friendly)",
          "Technical writing and documentation (full remote)",
        ],
      },
      {
        h2: "Companies that hire remote in EV",
        paragraphs: [
          "Bolt.Earth, Statiq, Numocity, Vecmocon, Magenta ChargeGrid, Battery Smart, Sun Mobility and several charging-tech startups are remote-friendly. Tata Elxsi and KPIT run hybrid for software roles. Ather, Ola, Tata Motors EV are office-default but make exceptions for senior specialists.",
        ],
      },
      {
        h2: "Pay parity",
        paragraphs: [
          "Remote-role salaries are at parity with hybrid for senior individual contributors. For junior roles, remote pays 10-15% less because companies amortise hiring + training cost differently. Hardware-adjacent software roles (embedded, controls) still default to hybrid because lab access matters.",
        ],
      },
    ],
    conclusion:
      "Remote work is easier in EV than in classic automotive but harder than in pure SaaS. Target the right role categories, the right startup-stage companies, and don't expect remote to be standard at OEMs.",
  },

  {
    slug: "ev-jobs-bengaluru-pune-chennai-delhi",
    title: "EV Jobs in Bengaluru, Pune, Chennai & Delhi — City-Wise Guide",
    excerpt:
      "Each of India's four big EV hiring clusters has a different role mix. Here's where to live based on what you want to do.",
    categorySlug: "ev-careers",
    tags: ["EV jobs Bengaluru", "EV jobs Pune", "EV jobs Chennai", "EV jobs Delhi"],
    lead:
      "India's EV industry clusters in four cities, each with a distinct flavour. Pick the right one and your job hunt is half done.",
    sections: [
      {
        h2: "Bengaluru — startups, software, charging",
        paragraphs: [
          "Ather Energy, Bolt.Earth, Battery Smart, Sun Mobility, Vecmocon, Magenta Mobility and most software-led EV companies are here. Best city for embedded, cloud, data, ML, product and design roles. Salaries are 15-20% above the national average for senior software.",
        ],
      },
      {
        h2: "Pune — Tier-1, ARAI, automotive heritage",
        paragraphs: [
          "Bajaj Auto EV, Tata Motors (Akurdi + Pimpri), ARAI, Bharat Forge, Sona Comstar BLW and a dense Tier-1 ecosystem (Bosch, Continental, Schaeffler, Valeo). Best city for power electronics, motor design, manufacturing, validation and homologation roles. ARAI is the single biggest concentration of EV test expertise in India.",
        ],
      },
      {
        h2: "Chennai — manufacturing, OEM scale",
        paragraphs: [
          "Hyundai India EV R&D, Ola Electric's gigafactory at Krishnagiri, BYD India and an established automotive supply chain. Best city for battery manufacturing, vehicle assembly, supply chain and OEM-scale engineering.",
        ],
      },
      {
        h2: "Delhi-NCR — policy, charging, fleet",
        paragraphs: [
          "Tata Power EZ Charge, ChargeZone, Statiq, Battery Smart, Sun Mobility, ICAT (Manesar) and most fleet operators are headquartered here. Best city for charging-infra, fleet ops, policy roles and government-adjacent work.",
        ],
      },
    ],
    conclusion:
      "If you're flexible on location, pick the city that matches your track. Bengaluru for software, Pune for power electronics + Tier-1, Chennai for manufacturing, Delhi for charging + fleet + policy.",
  },

  {
    slug: "government-jobs-electric-vehicle-industry-india",
    title: "Government Jobs in Electric Vehicle Industry — PSUs, ARAI, ICAT and More",
    excerpt:
      "From ARAI to BHEL to state DISCOMs, the public sector has its own EV hiring market. Here are the agencies, the roles and how to apply.",
    categorySlug: "ev-careers",
    tags: ["government EV jobs", "PSU EV jobs", "ARAI jobs", "ICAT jobs", "BHEL EV"],
    lead:
      "Government jobs are an underrated path into India's EV ecosystem. ARAI, ICAT, NATRiP, BHEL, BEL, CSIR-CEERI, CSIR-CECRI, NTPC, IOCL, HPCL and state DISCOMs all hire EV-specialised engineers. The pay is decent, the work is meaningful and the security is unmatched.",
    sections: [
      {
        h2: "Where the hiring happens",
        bullets: [
          "ARAI (Pune) — vehicle and component homologation",
          "ICAT (Manesar) — testing, certification, automotive R&D",
          "NATRiP / NATRAX (Pithampur) — high-speed test track and validation",
          "CSIR-CEERI (Pilani) — power electronics and SiC / GaN device research",
          "CSIR-CECRI (Karaikudi) — battery chemistry and electrolyte research",
          "BHEL Electric Mobility — EV powertrain and charging",
          "BEL — defence-adjacent EV electronics",
          "NTPC, IOCL, HPCL — charging-network deployment",
          "State DISCOMs (TANGEDCO, BESCOM, MSEDCL) — charging-grid integration",
          "DRDO — military mobility electrification",
        ],
      },
      {
        h2: "How to apply",
        paragraphs: [
          "Most central PSUs hire through GATE for engineering roles. Research institutes (CSIR, ARAI) hire through their own advertised positions on their websites and through gazette notifications. State DISCOMs use state-PSC exams.",
        ],
      },
      {
        h2: "What to expect on pay",
        paragraphs: [
          "Entry-level PSU CTC sits at ₹8-12 L for fresh BE/BTech graduates. Mid-level engineers (5-10 years) earn ₹12-22 L. Senior research scientists and chief engineers can clear ₹25-40 L. Below private-sector OEM scales but with strong job security and benefits.",
        ],
      },
    ],
    conclusion:
      "Government EV roles trade salary for stability and impact. If you want to shape India's EV regulatory and research landscape — ARAI, ICAT, CSIR — these are the right places to be.",
  },

  // ═══ Salary insights (8) ═══════════════════════════════════
  {
    slug: "electric-vehicle-engineer-salary-india-2026",
    title: "Electric Vehicle Engineer Salary in India — 2026 Breakdown",
    excerpt:
      "Detailed 2026 salary ranges for EV engineers in India across battery, motor, charging and software — entry to principal level.",
    categorySlug: "ev-salary",
    tags: ["EV engineer salary", "EV salary India", "battery engineer salary", "EV pay"],
    lead:
      "Salary transparency in India's EV industry is thin — most posted CTCs are misleading. We aggregated bands from EV employer postings, Levels.fyi-style submissions and recruiter conversations across 2024-25. Here's what EV engineers actually earn in 2026.",
    sections: [
      {
        h2: "Battery engineering",
        bullets: [
          "Entry (0-2 yr) — ₹6-9 L",
          "Junior (2-4 yr) — ₹9-14 L",
          "Mid (4-7 yr) — ₹14-28 L",
          "Senior (7-12 yr) — ₹28-55 L",
          "Lead / Principal (12+ yr) — ₹55 L-1.4 Cr",
        ],
      },
      {
        h2: "Power electronics + motor control",
        bullets: [
          "Entry — ₹6-9 L",
          "Junior — ₹10-16 L",
          "Mid — ₹16-32 L",
          "Senior — ₹32-65 L",
          "Principal architect — ₹65 L-1.5 Cr",
        ],
      },
      {
        h2: "Embedded + connected-car software",
        bullets: [
          "Entry — ₹5-8 L",
          "Junior — ₹8-14 L",
          "Mid — ₹14-28 L",
          "Senior — ₹28-55 L",
          "Lead — ₹55-95 L",
        ],
      },
      {
        h2: "EV charging hardware + software",
        bullets: [
          "Entry — ₹5-8 L",
          "Mid — ₹14-28 L",
          "Senior — ₹28-55 L",
          "Architect — ₹55-95 L",
        ],
      },
      {
        h2: "Manufacturing + quality + supply chain",
        bullets: [
          "Entry — ₹4-7 L",
          "Mid — ₹10-22 L",
          "Senior — ₹22-45 L",
          "Plant head — ₹50 L-1.5 Cr",
        ],
      },
      {
        h2: "What drives the spread",
        paragraphs: [
          "Three factors widen the band: ISO 26262 / ASIL experience (+15-25% premium), company stage (well-funded scale-ups pay 20-30% above OEMs), and ESOPs (worth 20-40% of base at venture-stage companies).",
        ],
      },
    ],
    conclusion:
      "India's EV salary inflation has cooled from the 30%+ growth of 2022-23 but remains 12-18% YoY for specialist roles. Battery, BMS, power electronics and functional-safety engineers keep the steepest premium — pick those if pay is the primary driver.",
  },

  {
    slug: "battery-engineer-salary-india",
    title: "Battery Engineer Salary in India — Entry to Senior Brackets",
    excerpt:
      "What battery cell, pack, BMS, thermal and safety engineers actually earn in India in 2026 — broken down by role and seniority.",
    categorySlug: "ev-salary",
    tags: ["battery engineer salary", "BMS engineer pay", "cell engineer", "EV salary"],
    lead:
      "Battery is the highest-demand specialism inside India's EV industry. Within battery there are five distinct sub-tracks, and the pay differs surprisingly. Here's the breakdown that recruiters won't give you upfront.",
    sections: [
      {
        h2: "Cell engineering",
        paragraphs: [
          "Electrochemistry-heavy work — formulation, coin-cell builds, formation cycling. Bands: ₹8-12 L entry, ₹15-25 L mid, ₹30-55 L senior, ₹55-90 L principal.",
        ],
      },
      {
        h2: "Pack engineering (mechanical + electrical)",
        paragraphs: [
          "Mechanical pack designers earn ₹6-9 L entry, ₹12-22 L mid, ₹22-40 L senior. Electrical pack engineers (busbars, fuses, contactors) overlap with BMS hardware and trend ₹1-2 L higher per band.",
        ],
      },
      {
        h2: "BMS hardware",
        paragraphs: [
          "Schematic capture + cell-sensing AFE + isolation barrier design. Bands: ₹8-12 L entry, ₹14-25 L mid, ₹25-50 L senior, ₹50-80 L lead.",
        ],
      },
      {
        h2: "BMS firmware + algorithms",
        paragraphs: [
          "State estimation, balancing, ISO 26262 safety. The pay is at the top of the battery tree because supply is rare: ₹9-14 L entry, ₹16-28 L mid, ₹28-60 L senior, ₹60 L-1.4 Cr lead.",
        ],
      },
      {
        h2: "Battery thermal + safety",
        paragraphs: [
          "Thermal engineers earn ₹15-32 L mid-career, ₹32-65 L senior. Safety engineers (AIS 156, HAZOP, abuse testing) trend 10-15% higher because of regulatory criticality.",
        ],
      },
    ],
    conclusion:
      "Within battery, BMS firmware and safety engineering pay the most. If you're picking your battery specialism by salary, start there. If you're picking by long-term career optionality, cell engineering keeps the most doors open.",
  },

  {
    slug: "bms-engineer-salary-india",
    title: "BMS Engineer Salary in India — What Companies Actually Pay",
    excerpt:
      "Battery Management System engineers earn some of the highest premiums in India's EV industry. Here's the breakdown by hardware vs firmware, junior to lead.",
    categorySlug: "ev-salary",
    tags: ["BMS engineer salary", "BMS firmware", "BMS hardware", "battery management system"],
    lead:
      "BMS engineers are the single most supply-constrained specialism in India's EV industry. The pay reflects that — but the bands vary based on whether you're on the hardware or firmware side, and which kind of company you work for.",
    sections: [
      {
        h2: "BMS hardware engineer",
        paragraphs: [
          "Hardware engineers design the cell-sensing AFE, isolation barriers, MCU board, protection circuits. Strong layout discipline matters. Bands: ₹8-12 L entry, ₹14-25 L mid, ₹25-50 L senior, ₹50-80 L lead.",
        ],
      },
      {
        h2: "BMS firmware engineer",
        paragraphs: [
          "Firmware engineers implement state estimation (SOC, SOH, SOP), cell balancing, ISO 26262-compliant safety mechanisms. Tight memory budgets reward careful C engineering. Bands: ₹9-14 L entry, ₹16-28 L mid, ₹28-60 L senior, ₹60 L-1.4 Cr lead.",
        ],
      },
      {
        h2: "Algorithm engineer",
        paragraphs: [
          "Pure algorithm engineers (Kalman filter, extended Kalman, advanced ML-driven SOH estimation) are rarest of all. Mid-career bands sit at ₹28-50 L, senior at ₹50 L-1 Cr.",
        ],
      },
      {
        h2: "Premium drivers",
        bullets: [
          "ISO 26262 ASIL-D experience: +15-25% on base",
          "Shipped production BMS: +10-20% on base",
          "Functional safety certification (ISO 26262 practitioner): +10% on base",
          "Working knowledge of cell electrochemistry: +5-10% on base (matters for the algorithm track)",
        ],
      },
      {
        h2: "Which companies pay the most",
        paragraphs: [
          "Venture-funded battery / BMS specialists (Ion Energy, Vecmocon, Exponent Energy, Log9 Materials) and 2W OEMs (Ather, Ola) pay at the top of these bands plus meaningful ESOPs. Tier-1 suppliers (Bosch, Continental) and established OEMs (Tata, Mahindra) pay closer to the median with stronger benefits and stability.",
        ],
      },
    ],
    conclusion:
      "If you're a BMS engineer or planning to become one, the pay trajectory is the most aggressive in Indian EV. Lean into ISO 26262 and shipped-product experience — both compound into 30%+ year-on-year increases.",
  },

  {
    slug: "ev-charging-station-engineer-salary",
    title: "EV Charging Station Engineer Salary — Field & Office Roles",
    excerpt:
      "Field installers, NOC engineers, hardware designers, OCPP firmware engineers — here's what each EV charging role pays in India.",
    categorySlug: "ev-salary",
    tags: ["EV charging salary", "OCPP engineer", "charging installer salary", "EV charging careers"],
    lead:
      "India's EV charging market is scaling 50%+ year-on-year and pulling along a diverse workforce — from field installers to OCPP firmware specialists. The pay scales differ sharply by role type. Here's the 2026 breakdown.",
    sections: [
      {
        h2: "Field roles",
        bullets: [
          "Charging Station Installer — ₹2.5-6.5 L entry, ₹6.5-12 L senior",
          "Charging Service Technician — ₹5-12 L (regional dispatch)",
          "Site Engineer (deployment) — ₹8-22 L",
          "Field Operations Engineer (regional cluster) — ₹12-28 L",
        ],
      },
      {
        h2: "Hardware engineering",
        bullets: [
          "AC charger designer — ₹14-28 L",
          "DC fast charger designer — ₹20-55 L",
          "MCS / V2G designer (emerging) — ₹35-90 L",
        ],
      },
      {
        h2: "Firmware + software",
        bullets: [
          "Charger firmware engineer (OCPP) — ₹14-28 L mid, ₹28-55 L senior",
          "ISO 15118 plug-and-charge engineer — ₹22-55 L",
          "CMS / platform engineer — ₹18-50 L",
          "DevOps for charging platform — ₹16-45 L",
        ],
      },
      {
        h2: "Commercial + ops",
        bullets: [
          "Site BD manager — ₹12-32 L",
          "Charging product manager — ₹25-65 L",
          "Network operations head — ₹40-90 L",
          "Head of Charging Infrastructure — ₹80 L-1.8 Cr",
        ],
      },
    ],
    conclusion:
      "Charging-infra hiring will grow faster than any other EV sub-sector through 2030. Pick a track that suits you — field engineers earn less but become indispensable to operators, while hardware / firmware specialists earn more but compete against a shrinking talent pool.",
  },

  {
    slug: "ev-service-technician-salary-india",
    title: "EV Service Technician Salary — 2W, 3W, 4W and Bus Networks",
    excerpt:
      "From two-wheeler service to electric bus fleet maintenance — what EV service technicians earn across categories and seniority.",
    categorySlug: "ev-salary",
    tags: ["EV technician salary", "EV service engineer pay", "2W service", "electric bus mechanic"],
    lead:
      "EV service is the workforce backbone of India's post-sale economy. Pay depends on the vehicle category, the OEM brand and the city. Here's the 2026 picture across 2W, 3W, 4W and bus segments.",
    sections: [
      {
        h2: "Two-wheeler EV service",
        bullets: [
          "Junior technician (1-3 yr) — ₹2.5-4 L",
          "Senior technician (3-6 yr) — ₹4-7 L",
          "Workshop lead — ₹7-12 L",
          "Service manager — ₹12-22 L",
        ],
      },
      {
        h2: "Three-wheeler EV service",
        bullets: [
          "Junior — ₹2.5-4 L",
          "Senior — ₹4-7 L",
          "Workshop lead — ₹7-12 L",
        ],
      },
      {
        h2: "Four-wheeler EV service",
        bullets: [
          "Junior — ₹3-5 L",
          "Senior (with OEM certification) — ₹5-10 L",
          "Workshop manager — ₹12-25 L",
        ],
      },
      {
        h2: "Electric bus fleet maintenance",
        bullets: [
          "Bus mechanic (depot) — ₹5-12 L",
          "Fleet engineer (regional) — ₹14-28 L",
          "Field service engineer — ₹18-40 L",
        ],
      },
      {
        h2: "Cross-category premium drivers",
        paragraphs: [
          "OEM-issued certifications (Tata, Ather, Ola, Hero, Mahindra) add ₹0.5-1.5 L on the base salary. ASDC Level 5 + ITI add ₹0.5 L. Multi-brand workshops typically pay 10-15% above single-brand dealer workshops.",
        ],
      },
    ],
    conclusion:
      "EV service offers the most predictable income growth path of any blue / grey-collar EV role. Get certified, pick a category, build seniority — workshop managers earning ₹20-25 L are increasingly common across major Indian cities.",
  },

  {
    slug: "top-paying-ev-companies-india",
    title: "Top-Paying EV Companies in India — Beyond Just OEMs",
    excerpt:
      "The highest-paying EV employers in India aren't always the OEMs. Here's the full list across cells, charging, software and Tier-1 suppliers.",
    categorySlug: "ev-salary",
    tags: ["top EV companies India", "EV employers", "highest paying EV companies", "EV jobs"],
    lead:
      "OEMs are the obvious EV employers but they're not always the highest payers. Venture-funded specialists, Tier-1 suppliers and global EV ER&D centres often pay more — especially at senior levels. Here's the 2026 employer-by-employer view.",
    sections: [
      {
        h2: "OEMs",
        bullets: [
          "Tata Motors EV — strong base + variable, stable",
          "Mahindra Electric — competitive, with ESOP at scale",
          "Ola Electric — aggressive base for technical hires, listed-company ESOPs",
          "Ather Energy — top of market for software + product",
          "Bajaj Auto EV — Pune-band leader for senior engineering",
          "Hyundai India EV R&D — high for senior power electronics",
          "MG Motor India — competitive for product + design",
        ],
      },
      {
        h2: "Cell + battery specialists",
        bullets: [
          "Reliance New Energy — top of market for cell engineers",
          "Exide Energy Solutions — strong for senior",
          "Amara Raja Energy — competitive",
          "Log9 Materials — premium with ESOPs",
          "Ion Energy / Vecmocon / Exponent Energy — startup premiums + meaningful ESOPs",
        ],
      },
      {
        h2: "Charging infrastructure",
        bullets: [
          "Tata Power EZ Charge — leader in pay + scale",
          "ChargeZone / Statiq — competitive at senior levels",
          "Bolt.Earth — strong software pay + ESOPs",
          "Magenta ChargeGrid — fleet-adjacent premiums",
        ],
      },
      {
        h2: "Tier-1 suppliers",
        bullets: [
          "Bosch India / Continental India — best for ISO 26262 + AUTOSAR roles",
          "KPIT / Tata Elxsi — top of market for OEM-software roles",
          "L&T Technology Services — competitive ER&D",
          "Sona Comstar BLW — leader for motor + power-electronics",
        ],
      },
      {
        h2: "Beyond CTC — what else to look at",
        paragraphs: [
          "Compare ESOPs (especially at venture-stage companies), variable pay structure, on-call expectations and learning trajectory. A 10% lower base at a company that ships fast and gives you ownership often beats a higher base at a stagnant org.",
        ],
      },
    ],
    conclusion:
      "Pay isn't the only signal but it's the cleanest one. Use the categories above to set your expectation band, then optimise for what compounds the fastest — usually the right team, not the highest digit.",
  },

  {
    slug: "ev-cxo-salaries-india",
    title: "EV CXO Salaries in India — CEO, CTO, CHRO and Heads-of Pay",
    excerpt:
      "What CXOs earn at Indian EV companies in 2026 — base, variable and ESOP across OEMs, charging, cells and venture-stage startups.",
    categorySlug: "ev-salary",
    tags: ["EV CXO salary", "EV CEO pay", "EV CTO salary", "executive pay EV"],
    lead:
      "CXO pay in India's EV industry has fragmented sharply across listed OEMs, growth-stage venture-funded companies and early-stage startups. Cash CTC varies less than you'd think — the ESOP layer is where the real spread lives.",
    sections: [
      {
        h2: "CEO",
        paragraphs: [
          "Listed OEM CEO cash CTC: ₹4-12 Cr. Growth-stage venture CEO cash CTC: ₹1.5-3 Cr + 1-3% equity. Early-stage founder CEO: ₹60 L-1.2 Cr + 5-15% equity.",
        ],
      },
      {
        h2: "CTO",
        paragraphs: [
          "Listed OEM CTO: ₹2.5-6 Cr cash. Growth-stage CTO: ₹1.2-2.5 Cr + 0.5-2% equity. Early-stage CTO: ₹50 L-1.2 Cr + 2-6% equity.",
        ],
      },
      {
        h2: "COO",
        paragraphs: [
          "Plant-heavy COO at OEMs: ₹2.5-5 Cr cash. Asset-light EV COO (charging / fleet): ₹1.5-3 Cr + ESOPs.",
        ],
      },
      {
        h2: "CFO",
        paragraphs: [
          "Listed OEM CFO: ₹3-7 Cr cash. Pre-IPO EV company CFO: ₹2-4 Cr + ESOPs.",
        ],
      },
      {
        h2: "CHRO + CPO",
        paragraphs: [
          "CHRO at listed OEMs: ₹2-4 Cr. CPO at venture-stage EV companies: ₹1.5-3 Cr + 0.5-1.5% equity.",
        ],
      },
      {
        h2: "Heads-of (one level below CXO)",
        bullets: [
          "Head of Battery — ₹80 L-2 Cr",
          "Head of Software — ₹80 L-1.8 Cr",
          "Head of Manufacturing (plant) — ₹70 L-1.5 Cr",
          "Head of Charging Infra — ₹80 L-1.8 Cr",
          "Head of Sales — ₹70 L-1.6 Cr",
          "Head of After-Sales — ₹65 L-1.4 Cr",
        ],
      },
    ],
    conclusion:
      "CXO offers in EV come with significant ESOP components. Spend serious time on dilution scenarios, vesting cliffs and liquidation preferences before signing — those decide whether the headline number is worth what it looks like.",
  },

  {
    slug: "ev-salaries-vs-it-traditional-auto",
    title: "How EV Salaries Compare to IT and Traditional Auto",
    excerpt:
      "Is EV pay actually higher than IT or ICE auto? We compared bands across 12 roles. The answer is more nuanced than the headlines suggest.",
    categorySlug: "ev-salary",
    tags: ["EV vs IT salary", "EV vs auto salary", "career switch", "EV pay comparison"],
    lead:
      "If you're weighing a career switch into EV from IT or traditional automotive, the salary question matters. Headlines suggest EV pays 30-50% more — the reality is more textured. Here's the comparison across 12 roles.",
    sections: [
      {
        h2: "Software roles — EV vs IT",
        paragraphs: [
          "Embedded engineers earn 10-25% above generic IT backend at the mid level, but 5-15% below at very senior levels because top-end IT (Google, Microsoft, FAANG-India) outpays everyone. Cloud engineers in EV earn at parity with IT at mid level, fall 10-20% behind at senior.",
        ],
      },
      {
        h2: "Hardware roles — EV vs auto",
        paragraphs: [
          "Battery, BMS, power electronics roles pay 20-35% above their ICE counterparts. Vehicle integration and chassis are at parity. NVH and manufacturing engineers earn at parity, with EV-side premium only for senior managers in scarce sub-specialisms.",
        ],
      },
      {
        h2: "Where EV pays best",
        bullets: [
          "Battery cell, BMS firmware, power electronics — 20-30% above market",
          "Functional safety (ISO 26262) — 15-25% above market",
          "Charging hardware + OCPP firmware — at parity with EV software market",
          "Senior CXO roles at venture-funded EV — variable comp + ESOPs add 50-100%",
        ],
      },
      {
        h2: "Where IT or auto still wins",
        bullets: [
          "Generic web / mobile development — IT premium",
          "Senior management at established auto OEMs — comparable base + stability",
          "FAANG-India software roles — out-pay even premium EV software",
        ],
      },
    ],
    conclusion:
      "Switch to EV if you want long-term skill compounding in a sector that's still expanding. Don't switch just for a salary bump — the headline-grabbing premiums show up only in specific sub-specialisms.",
  },

  // ═══ Interview prep (8) ══════════════════════════════════════
  {
    slug: "50-interview-questions-for-electric-vehicle-industry",
    title: "50 Interview Questions for Electric Vehicle Industry — With Answer Pointers",
    excerpt:
      "Comprehensive question bank for EV interviews — technical, behavioural, and company-fit — across battery, motor, charging, software and product roles.",
    categorySlug: "ev-interview-prep",
    tags: ["EV interview questions", "interview prep", "EV jobs", "interview preparation"],
    lead:
      "This is a comprehensive question bank covering technical fundamentals, role-specific deep dives and behavioural questions you'll encounter at every Indian EV company. Use it for last-week prep — go through every block, write your own 30-second answer for each, and rehearse out loud.",
    sections: [
      {
        h2: "Battery — 10 questions",
        bullets: [
          "Explain the difference between LFP and NMC chemistries.",
          "What's the SEI layer and why does it matter for cycle life?",
          "How would you size a 60-kWh pack for a 4W EV?",
          "What's thermal runaway and how do you prevent propagation?",
          "Walk through AIS 156 propagation test requirements.",
          "What's the role of formation cycling in cell manufacturing?",
          "Explain SOC, SOH and SOP — and how a BMS computes each.",
          "What's the trade-off between energy density and safety?",
          "How does silicon-graphite anode improve over pure graphite?",
          "What's the typical pack cost split between cells, BMS, thermal and enclosure?",
        ],
      },
      {
        h2: "Motor & power electronics — 10 questions",
        bullets: [
          "Compare PMSM, induction and switched-reluctance motors for EVs.",
          "What's FOC and why is it the dominant control strategy?",
          "Why use SiC over Si for traction inverters?",
          "What's field weakening and when is it active?",
          "How do you size DC-link capacitance?",
          "What's MTPA and why does it matter?",
          "Explain gate-driver dead-time and ringing.",
          "What's the difference between sensored and sensorless control?",
          "How do you mitigate EMI in a 75-kHz switching inverter?",
          "Walk through inverter efficiency at low vs high torque.",
        ],
      },
      {
        h2: "Charging — 8 questions",
        bullets: [
          "What's the difference between CCS-2, CHAdeMO and MCS?",
          "Explain how OCPP 1.6 differs from 2.0.1.",
          "What does ISO 15118 plug-and-charge enable?",
          "Walk through the AC charging sequence from EV to charger.",
          "What's the role of a CMS in a charging network?",
          "How do you size a DC fast charger for a fleet depot?",
          "Explain V2G architecture at hardware + software level.",
          "What are the safety interlocks in a public DC charger?",
        ],
      },
      {
        h2: "Software & systems — 10 questions",
        bullets: [
          "Explain AUTOSAR Classic architecture.",
          "What's ISO 26262 and the ASIL classification?",
          "Walk through a CAN frame structure.",
          "How would you design an OTA flow that survives a half-flashed update?",
          "What's ASPICE compliance?",
          "Explain a Kalman filter in the BMS state-estimation context.",
          "How do you partition safety-relevant code from non-safety?",
          "What's UDS and how is it used in service?",
          "Describe a HIL test setup.",
          "What's MISRA-C and why does it matter?",
        ],
      },
      {
        h2: "Behavioural — 12 questions",
        bullets: [
          "Why EV? Why now?",
          "Why this specific company?",
          "Tell me about a project you led end-to-end.",
          "Tell me about a time you failed and what you learned.",
          "Describe a conflict with a manager and how you resolved it.",
          "How do you handle ambiguous requirements?",
          "Walk me through a difficult technical decision you made.",
          "How do you stay current with EV industry developments?",
          "What's your view on India's EV trajectory over the next 5 years?",
          "What's a strong opinion you hold loosely about EVs?",
          "Tell me about a time you had to learn something fast.",
          "Where do you see yourself in 5 years?",
        ],
      },
    ],
    conclusion:
      "Pick the 20 most relevant questions for your specific role and rehearse 60-second answers for each. Time yourself — most candidates over-explain. Tight, concrete answers beat long-winded ones every time.",
  },

  {
    slug: "20-battery-engineer-interview-questions",
    title: "20 Battery Engineer Interview Questions and How to Answer Them",
    excerpt:
      "Real interview questions asked at Ola, Tata, Ather, Reliance and Log9 for battery engineer roles — with answer pointers.",
    categorySlug: "ev-interview-prep",
    tags: ["battery engineer interview", "BMS interview", "battery questions", "EV interview prep"],
    lead:
      "Battery engineer interviews mix electrochemistry fundamentals with applied design judgement. Here are 20 questions that recur across Indian battery employers, with the answer pattern interviewers are listening for.",
    sections: [
      {
        h2: "Fundamentals (8 questions)",
        bullets: [
          "What's the difference between energy and power density? When does each matter more?",
          "Why does cycle life depend on depth-of-discharge?",
          "Explain the SEI layer and how it grows.",
          "What's a CC-CV charging profile and why is it standard?",
          "How does temperature impact lithium-ion aging?",
          "What's coulombic efficiency and why does it matter?",
          "Explain Peukert's law and where it applies.",
          "What's the role of the separator in a Li-ion cell?",
        ],
      },
      {
        h2: "Design judgement (7 questions)",
        bullets: [
          "How would you size a pack for a 250 km city-EV with 80% range retention at year 5?",
          "Walk through your thermal-strategy choice between air, liquid cold-plate and immersion.",
          "When would you pick LFP over NMC?",
          "How do you decide on parallel vs series cell configuration in a module?",
          "What's your worst-case cell-imbalance design budget?",
          "Walk through your venting and TR-propagation containment plan.",
          "How do you specify a BMS for a new pack design?",
        ],
      },
      {
        h2: "Process + regulatory (5 questions)",
        bullets: [
          "What does AIS 156 require, and which clauses changed last year?",
          "Walk through your DV / PV plan structure.",
          "What's your incoming-cell inspection protocol?",
          "How do you triage a field-return pack with capacity-fade complaints?",
          "What documentation do you maintain through SOP?",
        ],
      },
    ],
    conclusion:
      "Battery interviews reward depth + judgement. Don't memorise textbook answers — practise narrating real design trade-offs from your own projects. If you don't have project experience yet, build one (a Simulink pack model, a coin-cell aging study) and tell that story.",
  },

  {
    slug: "25-bms-firmware-interview-questions",
    title: "25 BMS Firmware Engineer Interview Questions",
    excerpt:
      "Comprehensive question bank for BMS firmware interviews — state estimation, balancing, ISO 26262, comms and more.",
    categorySlug: "ev-interview-prep",
    tags: ["BMS firmware interview", "BMS engineer", "state estimation", "ISO 26262"],
    lead:
      "BMS firmware roles are the highest-leverage embedded jobs in Indian EV. Interviews mix C / C++ fundamentals, control theory, ISO 26262 and electrochemistry. Here are 25 questions to prep against.",
    sections: [
      {
        h2: "Embedded C + RTOS (8)",
        bullets: [
          "What's volatile in C, and when do you need it?",
          "How do you ensure thread-safety on a shared variable?",
          "Walk through a bare-metal initialisation sequence.",
          "What's the difference between a hard real-time and soft real-time task?",
          "Explain interrupt priorities on Cortex-M.",
          "How do you handle a watchdog reset gracefully?",
          "What's MISRA-C, and which rules do you find most useful?",
          "How do you partition stack vs heap on a 256 KB MCU?",
        ],
      },
      {
        h2: "State estimation (6)",
        bullets: [
          "Walk through SOC estimation using coulomb counting + open-circuit voltage fusion.",
          "Explain a Kalman filter for SOC.",
          "What's SOH and how would you estimate it online?",
          "How do you handle initial-condition uncertainty in your filter?",
          "What's drift in coulomb counting and how do you mitigate?",
          "When does SOP estimation fail and how do you fall back?",
        ],
      },
      {
        h2: "Balancing + protection (5)",
        bullets: [
          "Compare passive vs active balancing.",
          "How do you size balancing current?",
          "When do you trigger an over-voltage protection vs warning?",
          "Explain pre-charge sequencing.",
          "Walk through pyrofuse logic.",
        ],
      },
      {
        h2: "ISO 26262 + safety (6)",
        bullets: [
          "What's ASIL classification and how is it derived?",
          "Walk through HARA for a BMS.",
          "What's FMEDA?",
          "How do you implement safety mechanisms in firmware?",
          "What's the safety case, and what goes in it?",
          "Explain ASIL decomposition with an example.",
        ],
      },
    ],
    conclusion:
      "BMS firmware interviews go deep on at least one area. Pick your 2-3 strongest topics (state estimation + ISO 26262 is a strong combo) and be ready to whiteboard. Bring a printed copy of one project you led and walk through it without prompting.",
  },

  {
    slug: "20-ev-charging-engineer-interview-questions",
    title: "20 EV Charging Engineer Interview Questions",
    excerpt:
      "Question bank for EV charging hardware, firmware and operations roles — covering OCPP, ISO 15118, CCS-2, and deployment.",
    categorySlug: "ev-interview-prep",
    tags: ["charging engineer interview", "OCPP interview", "EV charging questions", "ISO 15118"],
    lead:
      "Charging engineer interviews split between hardware (designing the charger), firmware (running OCPP / ISO 15118), site engineering (deploying it) and operations (keeping it alive). Here are 20 questions across the four tracks.",
    sections: [
      {
        h2: "Hardware (6)",
        bullets: [
          "Compare PFC topologies for an AC charger.",
          "Walk through an LLC resonant converter for a DC charger.",
          "How do you size DC-link capacitance for a 60-kW fast charger?",
          "What's the CT and PT placement strategy in a charger?",
          "Explain EMI filter design for a fast charger.",
          "What's residual-current monitoring and why is it mandatory?",
        ],
      },
      {
        h2: "Firmware + protocols (8)",
        bullets: [
          "Walk through the OCPP boot-notification sequence.",
          "What's the difference between OCPP 1.6 and 2.0.1?",
          "How does ISO 15118 plug-and-charge authenticate?",
          "Explain the CCS-2 charging session state machine.",
          "What's the role of a PKI in plug-and-charge?",
          "How do you implement OTA on a charger that's deployed in the field?",
          "Walk through the SECC + EVCC interaction.",
          "What happens when network connectivity drops mid-session?",
        ],
      },
      {
        h2: "Site engineering + operations (6)",
        bullets: [
          "Walk through your site-survey checklist for a 30-kW DC charger installation.",
          "What's your typical earthing layout?",
          "How do you coordinate with DISCOM for a high-load site?",
          "What's your standard commissioning report?",
          "How do you triage an uptime issue from the NOC?",
          "What KPIs do you report to the operator on a monthly basis?",
        ],
      },
    ],
    conclusion:
      "Charging interviews vary heavily by company type. At hardware OEMs (Delta, Servotech) the focus is power-electronics depth. At operators (Tata Power EZ Charge, Statiq) it's deployment + uptime. Prep the area that matches your target company's product.",
  },

  {
    slug: "15-power-electronics-interview-questions-ev",
    title: "15 Power Electronics Interview Questions for EV Roles",
    excerpt:
      "Power electronics interview question bank for EV traction inverter, DC-DC, OBC and charger roles in Indian EV companies.",
    categorySlug: "ev-interview-prep",
    tags: ["power electronics interview", "SiC interview", "inverter design", "EV interview"],
    lead:
      "Power electronics interviews for EV roles drill into device-level + circuit-level + system-level questions. Here are 15 that recur across Bosch India, Continental India, Sona Comstar BLW and the EV OEMs.",
    sections: [
      {
        h2: "Devices",
        bullets: [
          "When does SiC outperform Si MOSFET and at what cost delta?",
          "Explain gate-driver requirements for SiC vs IGBT.",
          "What's the role of Miller capacitance in switching loss?",
          "Walk through double-pulse test interpretation.",
          "What's the body diode behaviour in a SiC MOSFET?",
        ],
      },
      {
        h2: "Circuits",
        bullets: [
          "Compare half-bridge vs T-type vs neutral-point-clamped topologies.",
          "How do you mitigate ringing in a hard-switched half-bridge?",
          "What's the role of decoupling capacitance in switching loops?",
          "Walk through bus-bar parasitic inductance design.",
          "How do you design snubbers vs avoid them?",
        ],
      },
      {
        h2: "System + EMC",
        bullets: [
          "How do you size DC-link capacitance?",
          "Walk through CISPR 25 conducted-emission limits.",
          "What's the typical EMI filter topology for an inverter?",
          "Explain common-mode vs differential-mode noise.",
          "How do you measure efficiency at low torque vs high torque?",
        ],
      },
    ],
    conclusion:
      "Senior power-electronics interviews favour candidates who can sketch on a whiteboard while talking. Practise that — load up an erasable board at home, set a stopwatch, talk through your last design as if to the interviewer.",
  },

  {
    slug: "ev-service-technician-interview-questions",
    title: "EV Service Technician Interview Questions — Workshop & Field",
    excerpt:
      "Interview question bank for EV service technician roles — covering HV safety, diagnostics, customer handling and OEM-specific procedures.",
    categorySlug: "ev-interview-prep",
    tags: ["EV technician interview", "service technician questions", "EV interview", "HV safety"],
    lead:
      "EV service technician interviews are practical-first. Most OEMs and dealerships will combine an oral interview with a hands-on diagnostic test. Here's the question set you'll face — and the test you should be ready for.",
    sections: [
      {
        h2: "HV safety (5)",
        bullets: [
          "Walk through your LOTO procedure before opening a battery pack.",
          "What PPE do you wear for HV work?",
          "How do you verify isolation before touching live components?",
          "What's the role of the MSD / service plug?",
          "What do you do if you detect a thermal-runaway smell on a serviced pack?",
        ],
      },
      {
        h2: "Diagnostics (7)",
        bullets: [
          "A customer reports their EV won't power on. Walk through your diagnostic sequence.",
          "How do you read DTCs on a Tata Punch EV?",
          "Customer complains of reduced range. What's your investigation?",
          "How do you test a charger that's tripping the breaker?",
          "Walk through inverter fault diagnosis.",
          "How do you check cell-imbalance from the OEM scanner?",
          "What's your sequence when a vehicle reports a 'service required' lamp?",
        ],
      },
      {
        h2: "Customer + workflow (5)",
        bullets: [
          "How do you explain a complex repair to a non-technical customer?",
          "How do you handle a customer who insists their warranty should cover a non-covered repair?",
          "Walk through your DMS workflow for a job card.",
          "How do you maintain first-time-right scores?",
          "What's your sequence when a part you need isn't in stock?",
        ],
      },
    ],
    conclusion:
      "If you've got an OEM-issued certification (Tata, Mahindra, Ather, Ola, Hero) lead with it. Bring printed copies of your ASDC and OEM certifications. Be ready to demonstrate using a multimeter, insulation tester and the OEM diagnostic scanner if the interview includes a workshop component.",
  },

  {
    slug: "ev-manufacturing-engineer-interview-questions",
    title: "EV Manufacturing Engineer Interview Questions",
    excerpt:
      "Interview question bank for EV manufacturing engineer roles — covering line balancing, OEE, Lean / Six Sigma and HV-safety governance.",
    categorySlug: "ev-interview-prep",
    tags: ["manufacturing interview", "EV plant", "Lean Six Sigma", "EV interview"],
    lead:
      "Manufacturing engineer interviews at EV plants test for shop-floor judgement + process discipline + safety awareness. Here are the questions that recur at Tata, Mahindra, Ola, Ather and Hero plants.",
    sections: [
      {
        h2: "Process + line (7)",
        bullets: [
          "Walk through your standard OEE calculation.",
          "How do you respond to a sudden 15% drop in line OEE?",
          "Explain your line-balancing approach for a new variant.",
          "What's your takt-time philosophy?",
          "How do you build a PFMEA from scratch?",
          "Walk through SPC chart interpretation with a real example.",
          "What's your standard ramp-up curve for a new model?",
        ],
      },
      {
        h2: "Lean + improvement (5)",
        bullets: [
          "Tell me about a Kaizen you led.",
          "Walk through a VSM you've done.",
          "How do you sustain 5S long-term?",
          "What's your typical poka-yoke design philosophy?",
          "Explain Jidoka with a real-line example.",
        ],
      },
      {
        h2: "EV-specific safety (5)",
        bullets: [
          "Walk through HV-line safety protocols.",
          "How do you train operators on battery pack handling?",
          "What's your incident response for a thermal-runaway event?",
          "How do you manage cell-traceability per AIS 156 requirements?",
          "Explain your battery storage + segregation plan.",
        ],
      },
    ],
    conclusion:
      "Manufacturing interviews reward concrete numbers. Don't say 'I improved efficiency' — say 'I lifted line OEE from 71 to 84 over Q2 by reducing changeover from 25 to 9 minutes.' Bring printed dashboards or before / after slides if possible.",
  },

  {
    slug: "ev-sales-manager-interview-questions",
    title: "EV Sales Manager Interview Questions",
    excerpt:
      "Interview question bank for EV sales manager roles — covering TCO selling, fleet RFPs, dealer management and government tenders.",
    categorySlug: "ev-interview-prep",
    tags: ["EV sales interview", "fleet sales", "EV career", "interview prep"],
    lead:
      "EV sales interviews look for two things: consultative-selling chops and EV-domain literacy. Here are the questions that recur, plus what good answers look like.",
    sections: [
      {
        h2: "Domain understanding (5)",
        bullets: [
          "Walk me through the EV TCO calculation for a fleet operator.",
          "Why would a fleet operator pick BaaS over outright ownership?",
          "Explain the differences between AC and DC charging from the customer's POV.",
          "What's FAME-II, and how does it affect your deal economics?",
          "Walk through the financing options available to an EV buyer in India today.",
        ],
      },
      {
        h2: "Sales process (7)",
        bullets: [
          "Walk through a complex EV deal you closed end-to-end.",
          "How do you handle a fleet operator pushing back on your TCO numbers?",
          "What's your standard discovery sequence?",
          "How do you handle a long deal cycle (6-12 months) without losing momentum?",
          "Tell me about a deal you lost. What would you do differently?",
          "How do you build pipeline in a territory you've never sold into?",
          "Walk through your typical close sequence on a 50+ vehicle fleet deal.",
        ],
      },
      {
        h2: "Channel + team (4)",
        bullets: [
          "How would you onboard a new dealer in your territory?",
          "How do you coach a sales rep underperforming on quota?",
          "What's your monthly forecasting rhythm?",
          "How do you balance dealer interests against direct corporate sales?",
        ],
      },
    ],
    conclusion:
      "Sales interviews reward specifics. Have 2-3 deal stories memorised end-to-end with numbers (quota, deal size, cycle time, stakeholders, what closed it). Generic 'I exceeded my quota' answers don't differentiate. The fleet TCO walkthrough is the single most predictive technical question — get fluent at it.",
  },

  // ═══ Skills & Training (8) ══════════════════════════════════
  {
    slug: "top-15-skills-to-learn-for-ev-industry-jobs-2026",
    title: "Top 15 Skills to Learn for EV Industry Jobs in 2026",
    excerpt:
      "The 15 most-hired EV industry skills in 2026 — from battery chemistry to OCPP firmware to ISO 26262. Pick 2-3 and go deep.",
    categorySlug: "ev-skills-training",
    tags: ["EV skills", "EV jobs", "skills to learn", "EV career roadmap"],
    lead:
      "If you're skilling up for the EV industry, the biggest risk is spreading too thin. These 15 skills come up in 80% of EV job descriptions in India. Pick 2-3 that map to your existing background and go 4-feet deep, not 4-inches wide.",
    sections: [
      {
        h2: "Battery + electrochemistry (4)",
        bullets: [
          "Lithium-ion cell chemistry (LFP, NMC, NCA, emerging silicon-anode)",
          "Battery thermal management (cold-plate, refrigerant, heat-pump)",
          "Battery safety + abuse testing (AIS 156, IS 17017)",
          "Battery aging modelling (cycle + calendar)",
        ],
      },
      {
        h2: "BMS + power electronics (4)",
        bullets: [
          "BMS state estimation (SOC, SOH, SOP via Kalman filter)",
          "SiC / GaN device design",
          "FOC + motor control",
          "ISO 26262 functional safety",
        ],
      },
      {
        h2: "Charging + integration (3)",
        bullets: [
          "OCPP 1.6 / 2.0.1 firmware",
          "ISO 15118 plug-and-charge",
          "EV charging hardware (CCS-2, MCS)",
        ],
      },
      {
        h2: "Software + data (4)",
        bullets: [
          "AUTOSAR Classic / Adaptive",
          "Embedded Linux + Yocto",
          "Connected-car backend (MQTT, Kafka, time-series databases)",
          "MLOps + battery analytics",
        ],
      },
      {
        h2: "How to learn",
        paragraphs: [
          "AICTE-approved DIYguru programs cover most of these. SAE India runs HEV / PHEV / EV certifications. ARAI Academy runs short courses in homologation. For software, work through TI C2000 or NXP S32K tutorials plus hands-on Simulink modelling.",
        ],
      },
    ],
    conclusion:
      "Pick 2-3 skills and ship a small project that demonstrates each. A 12-week effort with one concrete project beats a 6-month course library. Recruiters hire for evidence, not certificates.",
  },

  {
    slug: "aicte-approved-ev-courses-india-compared",
    title: "AICTE-Approved EV Courses in India — Compared",
    excerpt:
      "A side-by-side comparison of AICTE-approved EV training programs in India — by depth, duration, cost, placement and recognition.",
    categorySlug: "ev-skills-training",
    tags: ["AICTE EV courses", "DIYguru", "ISIE", "EV training", "EV certification"],
    lead:
      "AICTE recognition is the single most useful filter when shortlisting EV courses in India. It signals industry-aligned curriculum, recognised testing, and traction in placement networks. Here are the most-credible AICTE-approved EV programs in India in 2026.",
    sections: [
      {
        h2: "DIYguru — eMobility Academy",
        paragraphs: [
          "India's flagship EV academy with the largest physical training footprint (200+ partner labs across colleges and ITIs). Multiple AICTE-approved certification tracks — EV powertrain, BMS, charging-infrastructure, advanced battery. Placement support across Tata, Mahindra, Ola, Ather, Hero MotoCorp and the Tier-1 supplier base.",
          "Best fit: candidates who want OEM-aligned curriculum + structured placement support.",
        ],
      },
      {
        h2: "ISIE India",
        paragraphs: [
          "AICTE-recognised EV training and consulting body. Runs PG and certificate programs in EV design, manufacturing and homologation. Strong fit for senior engineers who want a formal certification.",
        ],
      },
      {
        h2: "ARAI Academy",
        paragraphs: [
          "India's apex automotive R&D body runs short courses in homologation, testing, calibration and EV systems. Best fit: working engineers who want exposure to regulatory-side EV work.",
        ],
      },
      {
        h2: "ASDC (Automotive Skills Development Council)",
        paragraphs: [
          "Owns the National Occupational Standards for EV technicians, charge-point operators and powertrain engineers. Their Level 3-5 NSQF programs are recognised by every OEM service network in India.",
        ],
      },
      {
        h2: "SAE India",
        paragraphs: [
          "Standards-body-led HEV / PHEV / EV engineering certifications. Best fit: candidates targeting global OEM or Tier-1 supplier roles where SAE recognition carries.",
        ],
      },
    ],
    conclusion:
      "AICTE alone isn't enough — pair the certification with a hands-on project portfolio. For most candidates, DIYguru offers the best combination of depth, placement support and OEM credibility. Pick the program that matches your target track, not the cheapest one.",
  },

  {
    slug: "best-online-ev-courses-working-professionals",
    title: "Best Online EV Courses for Working Professionals",
    excerpt:
      "Online EV courses that working professionals can complete in 8-16 weeks — with curriculum, time commitment and ROI.",
    categorySlug: "ev-skills-training",
    tags: ["online EV courses", "EV upskilling", "working professional", "DIYguru online"],
    lead:
      "Working professionals can't take 6 months off for an offline course. The best online EV programs in India run 8-16 weeks with live sessions on weekends, project work in your time, and a placement-support cadence afterward. Here are the ones worth your weekend.",
    sections: [
      {
        h2: "DIYguru Online — EV Powertrain Specialisation",
        paragraphs: [
          "12-week specialisation covering battery, motor, controller and vehicle integration. Live weekend sessions plus hands-on lab access at partner colleges. AICTE-approved with placement support.",
        ],
      },
      {
        h2: "DIYguru Online — BMS Design",
        paragraphs: [
          "10-week deep-dive on BMS hardware + firmware. Includes Simulink BMS modelling and an ESP32-based mini-BMS project.",
        ],
      },
      {
        h2: "DIYguru Online — EV Charging Infrastructure",
        paragraphs: [
          "10-week program on charger hardware, OCPP firmware, site engineering and operations. Best fit for IT / electrical engineers moving into charging-network roles.",
        ],
      },
      {
        h2: "SAE India — HEV / EV Foundation",
        paragraphs: [
          "8-week SAE-credentialed program covering EV powertrain fundamentals + emerging tech. Recognised globally; good fit for export-market-facing roles.",
        ],
      },
      {
        h2: "ARAI Academy — Online EV Modules",
        paragraphs: [
          "Short 4-6 week modules on testing, calibration, homologation. Best for working engineers in adjacent tracks (engine, transmission, testing) who want EV exposure.",
        ],
      },
      {
        h2: "What to look for",
        bullets: [
          "AICTE / NSDC / SAE recognition",
          "Hands-on project that you can show on your CV",
          "Live instructor-led sessions (not just recorded videos)",
          "Placement support after completion",
          "Industry-aligned curriculum (validated by OEMs, not just academics)",
        ],
      },
    ],
    conclusion:
      "An online course alone won't get you hired, but the right one — paired with a portfolio project + targeted applications — is the single highest-leverage way to switch into EV without quitting your current job.",
  },

  {
    slug: "iti-to-ev-job-step-by-step",
    title: "ITI to EV Job — Step by Step",
    excerpt:
      "A practical step-by-step roadmap for ITI graduates targeting EV-industry jobs in service, charging, manufacturing or battery roles.",
    categorySlug: "ev-skills-training",
    tags: ["ITI EV", "ITI jobs", "EV technician", "ASDC certification", "EV career"],
    lead:
      "ITI graduates are the most-recruited segment in India's EV workforce — but most don't know how to take the first step. Here's the concrete roadmap that gets you from ITI completion to a confirmed EV-industry offer within 6 months.",
    sections: [
      {
        h2: "Step 1 — Pick your track",
        paragraphs: [
          "Service (workshop), charging (field install + service), manufacturing (line operator) and battery (assembly / test). Pick one based on what's locally hireable. Most metros have all four; Tier-2 cities lean toward service + manufacturing.",
        ],
      },
      {
        h2: "Step 2 — Get the right ITI trade",
        bullets: [
          "Electrician trade — best for charging install + EV service",
          "Mechanic trade — best for vehicle service + manufacturing",
          "Electronics mechanic — best for battery + BMS",
          "Refrigeration & AC trade — emerging niche for thermal-system work",
        ],
      },
      {
        h2: "Step 3 — Add an ASDC certification",
        paragraphs: [
          "ASDC NSQF Level 3 or 4 in EV technician roles is the gold standard. Most DIYguru partner labs run these programs in 3-6 months. Add it after your ITI completion or alongside.",
        ],
      },
      {
        h2: "Step 4 — Get an OEM badge",
        paragraphs: [
          "Tata Motors Academy, Mahindra Skill Centre, Hero MotoCorp Skill Centre, Ather Service Academy and Ola Service Academy all run OEM-specific certification programs that route directly into their service networks. One OEM badge typically adds ₹50,000-1,50,000 to your starting CTC.",
        ],
      },
      {
        h2: "Step 5 — Apply through the right channel",
        bullets: [
          "DIYguru placement cell (if you trained there)",
          "OEM service centre walk-in (carry your ITI + ASDC + OEM badge)",
          "Local dealer service workshop",
          "DDM / RTI department of state transport for bus depot roles",
          "Direct walk-in at charging operator depots (Tata Power, Statiq, ChargeZone)",
        ],
      },
      {
        h2: "Step 6 — Build seniority",
        paragraphs: [
          "After 2-3 years on-job, take ASDC Level 5 (supervisor) and shoot for workshop-lead or shift in-charge. Those roles pay ₹8-14 L and open the door to management tracks.",
        ],
      },
    ],
    conclusion:
      "ITI to EV is one of the most direct career paths in India today. Follow the six steps in order — ITI, ASDC, OEM badge, targeted apply, then build seniority — and you'll be in a stable, growing role within 6 months of completion.",
  },

  {
    slug: "diyguru-certifications-what-they-cover",
    title: "DIYguru Certifications — What They Cover and Where Graduates Land",
    excerpt:
      "An overview of DIYguru's flagship EV certifications — curriculum, duration, placement outcomes and how to enrol.",
    categorySlug: "ev-skills-training",
    tags: ["DIYguru", "DIYguru certification", "EV training", "EV academy"],
    lead:
      "DIYguru is India's largest EV training academy — 200+ partner labs, AICTE-approved certifications, and placement support across the EV industry. Here's what their core certification tracks cover and where their graduates typically land.",
    sections: [
      {
        h2: "EV Powertrain Specialisation",
        paragraphs: [
          "12-week program covering battery basics, motor control, inverter design and vehicle integration. Best fit: mechanical / electrical engineering students or working professionals from ICE auto backgrounds. Graduates typically land roles at Tata Motors EV, Mahindra Electric, Ather Energy, Ola Electric and Bajaj Auto EV.",
        ],
      },
      {
        h2: "BMS Design Specialisation",
        paragraphs: [
          "10-week program on BMS hardware and firmware. Includes practical work with cell-sensing AFEs and Simulink BMS modelling. Graduates land at Bosch India, Continental India, Ion Energy, Vecmocon and OEM battery teams.",
        ],
      },
      {
        h2: "EV Charging Infrastructure",
        paragraphs: [
          "10-week program on AC/DC charger hardware, OCPP firmware and site engineering. Graduates land at Tata Power EZ Charge, ChargeZone, Statiq, Numocity, Delta Electronics and Servotech.",
        ],
      },
      {
        h2: "Advanced Battery Engineering",
        paragraphs: [
          "16-week PG-level program covering cell chemistry, pack design, thermal management and safety. Graduates land at Log9 Materials, Exide Energy Solutions, Reliance New Energy, ARAI and ICAT.",
        ],
      },
      {
        h2: "EV Service Technician (ASDC Level 4)",
        paragraphs: [
          "6-month hands-on program for ITI / diploma graduates. Graduates land at OEM dealer service networks across India.",
        ],
      },
      {
        h2: "How to enrol",
        paragraphs: [
          "Visit diyguru.org and pick the track that matches your background. Enrolment is rolling — most programs run in cohorts every 4-8 weeks. Scholarships are available for ITI students and women candidates through several DIYguru partner programs.",
        ],
      },
    ],
    conclusion:
      "DIYguru's combination of AICTE approval, OEM-aligned curriculum and placement support makes it the most direct route into the EV industry for most candidates. Pick the track that matches your background and target outcome.",
  },

  {
    slug: "battery-engineering-course-curriculum-checklist",
    title: "Battery Engineering Course Curriculum — What to Look For",
    excerpt:
      "Most battery courses skip the things that actually matter on the job. Here's the curriculum checklist that separates serious programs from box-ticking ones.",
    categorySlug: "ev-skills-training",
    tags: ["battery course", "battery engineering", "EV curriculum", "course evaluation"],
    lead:
      "A good battery course teaches the things you'll actually need on day one — cell chemistry, pack design, BMS basics, AIS 156, hands-on lab work. A weak course skips the lab and overweights regulatory framing. Use this checklist to filter.",
    sections: [
      {
        h2: "Must-have modules",
        bullets: [
          "Electrochemistry fundamentals — anode, cathode, electrolyte, separator chemistry",
          "Cell types and chemistries — LFP, NMC, NCA, sodium-ion comparison",
          "Cell manufacturing process — mixing, coating, calendaring, assembly",
          "Cell formation and aging",
          "Pack architecture — series / parallel, busbar, harness",
          "Pack mechanical and thermal design",
          "BMS fundamentals — sensing, balancing, state estimation",
          "Charging strategies — CC-CV, fast-charging profiles",
          "Safety — thermal runaway, propagation, abuse testing",
          "AIS 156 / ECE R100 / IS 17017 walkthrough",
        ],
      },
      {
        h2: "Hands-on requirements",
        bullets: [
          "At least one coin-cell build + characterisation",
          "Simulink pack modelling",
          "BMS bench-test exposure (any vendor reference design)",
          "Climatic chamber + cycler interpretation",
          "Walkthrough of a real DV / PV plan",
        ],
      },
      {
        h2: "Red flags",
        bullets: [
          "Course covers only theory — no lab",
          "No mention of AIS 156 or regulatory framework",
          "No practitioner-led modules",
          "Vague placement claims without specific company names",
          "All-pre-recorded with no live sessions",
        ],
      },
    ],
    conclusion:
      "Pick programs that are heavy on hands-on lab work, that name specific companies in their placement statistics, and that have practitioner faculty (not just academic faculty). DIYguru, ISIE India and the IIT-Madras CBEEV continuing-ed programs check most of these boxes.",
  },

  {
    slug: "power-electronics-skills-every-ev-engineer-needs",
    title: "Power Electronics Skills Every EV Engineer Should Master",
    excerpt:
      "The 10 power electronics skills that recur across every EV inverter, charger and converter role in India.",
    categorySlug: "ev-skills-training",
    tags: ["power electronics skills", "SiC", "EV engineer skills", "inverter design"],
    lead:
      "Power electronics is the single highest-leverage technical specialism in the EV industry. Indian companies are competing globally for the rare engineers who combine device, circuit and system understanding. Here are the 10 skills that compound the most.",
    sections: [
      {
        h2: "The 10 skills",
        bullets: [
          "Switch-mode converter topologies (buck, boost, LLC, dual active bridge)",
          "SiC and GaN device characterisation and selection",
          "Gate-driver design and dead-time tuning",
          "Magnetics design (inductor / transformer for EV applications)",
          "DC-link sizing and ripple analysis",
          "Bus-bar parasitic-inductance design and analysis",
          "Thermal design for power modules",
          "EMI / EMC mitigation (CISPR 25 + IEC 61851)",
          "Motor-control algorithms (FOC, MTPA, field weakening)",
          "ISO 26262 hardware-side compliance (ASIL-rated design)",
        ],
      },
      {
        h2: "Tools to get fluent in",
        bullets: [
          "Altium Designer or Cadence Allegro (PCB)",
          "PLECS or LTspice (circuit simulation)",
          "MATLAB / Simulink (control)",
          "ANSYS Q3D or Maxwell (electromagnetic + parasitic)",
          "Tektronix or Keysight bench (oscilloscope, power analyser)",
        ],
      },
      {
        h2: "How to skill up",
        paragraphs: [
          "Read the Texas Instruments and Wolfspeed application notes for SiC. Take SAE India or IEEE Power Electronics Society short courses. Build a small bench-scale prototype — even a 100W DC-DC converter teaches more than 6 months of books.",
        ],
      },
    ],
    conclusion:
      "Power electronics is one of those specialisms where 12-24 months of deep work compounds into a career-long premium. Pick this if you like hands-on lab work and don't mind a slower upfront ramp.",
  },

  {
    slug: "sae-asdc-certifications-that-land-ev-jobs",
    title: "SAE / ASDC Certifications That Land EV Jobs",
    excerpt:
      "Which SAE and ASDC certifications actually move the hiring needle for EV roles in India — and which are nice-to-have only.",
    categorySlug: "ev-skills-training",
    tags: ["SAE certification", "ASDC certification", "EV certification", "EV career"],
    lead:
      "SAE and ASDC offer a long list of EV-related certifications. A few actually move the hiring needle in India. The rest are nice-to-have but won't get you an interview by themselves. Here's the practical filter.",
    sections: [
      {
        h2: "SAE certifications that count",
        bullets: [
          "SAE HEV / PHEV / EV Engineering Concepts (foundational, well-recognised at OEMs and Tier-1s)",
          "SAE J1772 / J1939 standards course (relevant for charging + bus engineering)",
          "SAE Functional Safety + ISO 26262 (essential for engineering-track candidates)",
          "SAE Cybersecurity for Connected & Automated Vehicles (emerging requirement)",
        ],
      },
      {
        h2: "ASDC certifications that count",
        bullets: [
          "ASDC Level 4 EV Service Technician (mandatory for service roles)",
          "ASDC Level 5 EV Powertrain Specialist (lifts pay 15-25%)",
          "ASDC Battery Operator Level 3-4 (mandatory for battery line roles)",
          "ASDC Charging Station Technician Level 4 (mandatory for charging roles)",
          "ASDC EV Manufacturing Supervisor Level 5 (path to shop-floor management)",
        ],
      },
      {
        h2: "Nice-to-haves",
        bullets: [
          "Generic SAE membership (not a certification)",
          "Online MOOCs without an in-person component",
          "Vendor-specific certifications without industry recognition",
        ],
      },
      {
        h2: "How to choose",
        paragraphs: [
          "Pick one foundational SAE + one role-specific ASDC. Don't collect certifications — pick two that match your target role and lean on them in your CV and interviews.",
        ],
      },
    ],
    conclusion:
      "Two well-chosen certifications beat five random ones. Pair an ASDC level-4 (your role match) with one SAE foundational (your domain match), and you'll outperform 80% of competing CVs.",
  },

  // ═══ Networking (6) ═════════════════════════════════════════
  {
    slug: "how-to-build-professional-network-ev-industry",
    title: "How to Build a Professional Network in the EV Industry",
    excerpt:
      "Networking in the EV industry isn't about adding strangers on LinkedIn. Here's a 90-day plan to build a real network that opens job opportunities.",
    categorySlug: "ev-networking",
    tags: ["EV networking", "professional network", "EV career", "networking tips"],
    lead:
      "Networking is the single highest-leverage activity in any career, but most professionals do it badly — collecting LinkedIn connections without building real relationships. Here's the 90-day plan that actually works for the EV industry.",
    sections: [
      {
        h2: "Week 1-2 — Map your existing network",
        paragraphs: [
          "List 30 people you already know who are at least one connection away from EV companies — ex-classmates, ex-colleagues, dealers, customers, vendors. Most candidates underestimate this list. You'll be surprised who can introduce you.",
        ],
      },
      {
        h2: "Week 3-6 — Reactivate",
        paragraphs: [
          "Reach out to 5 people per week with a short, specific note. Don't ask for a job. Ask for a 20-minute conversation about their work. Bring one specific question per conversation. Always end with: 'Who else should I talk to?'",
        ],
      },
      {
        h2: "Week 7-10 — Show up offline",
        paragraphs: [
          "Attend the right events: Auto Expo, SAE India events, ARAI seminars, DIYguru meet-ups, local IEEE Power Electronics chapter meetings, ICAT open-house days. One in-person event delivers 10x the connection density of a month on LinkedIn.",
        ],
      },
      {
        h2: "Week 11-12 — Add value first",
        paragraphs: [
          "Share something useful — a market report you summarised, a JD template, a regulatory update — into your now-warm network. The people who help others first compound their network 3x faster than the askers.",
        ],
      },
      {
        h2: "Sustain — once you've started",
        bullets: [
          "Post one substantive thing per week on LinkedIn (not job-search posts)",
          "Reach out to 2 new people per week with a specific reason",
          "Attend at least 1 event per quarter",
          "Stay in touch with your top 20 connections through a quick monthly note",
        ],
      },
    ],
    conclusion:
      "A good network feels effortless after 12 weeks because you've shifted from cold-asking to warm-asking. Most senior EV professionals will say yes to a 20-minute conversation when a mutual connection refers you. Build that bridge consistently.",
  },

  {
    slug: "networking-on-emobility-careers-platform",
    title: "Networking on emobility.careers — Tips for Candidates",
    excerpt:
      "How to get the most out of emobility.careers as a networking platform — followers, posts, connection requests and visibility.",
    categorySlug: "ev-networking",
    tags: ["emobility.careers", "EV networking", "LinkedIn alternative", "platform tips"],
    lead:
      "emobility.careers is India's largest EV-focused professional network. Beyond job applications, it's a community where engineers, founders, recruiters and academics discuss work, share knowledge and find collaborators. Here's how to get the most out of it as a candidate.",
    sections: [
      {
        h2: "Build a complete profile",
        paragraphs: [
          "A 100%-complete profile gets 7x the search visibility of a half-completed one. Add a clear headshot, headline, 2-paragraph about, all your experience, education, skills, certifications and one or two projects. Mark your EV-domain interests (battery, motor, charging, software) so recruiter searches surface you.",
        ],
      },
      {
        h2: "Follow the right people",
        paragraphs: [
          "Founders, CTOs, Heads of Engineering at the top 30 EV companies. Once you follow, their posts appear in your feed and you start absorbing the industry's working conversations. Comment thoughtfully on 2-3 posts per week.",
        ],
      },
      {
        h2: "Post regularly",
        bullets: [
          "Share a project you shipped",
          "Summarise an article or industry report",
          "Ask a specific technical question",
          "Share a learning from a course",
          "Celebrate a teammate or mentor",
        ],
      },
      {
        h2: "Send connection requests with context",
        paragraphs: [
          "Include a short note: where you met (event, post, mutual connection), why you want to connect, and one specific thing you'd like to discuss. Generic requests get ignored.",
        ],
      },
      {
        h2: "Use the platform's features",
        bullets: [
          "JD templates — read 5-10 in your target role to refine your CV",
          "Salary Compass — submit anonymously to unlock the database",
          "Company pages — follow the 10 companies you'd most want to work at",
          "Articles — read 1-2 per week, comment thoughtfully",
        ],
      },
    ],
    conclusion:
      "emobility.careers rewards consistency. Spend 30 minutes per week — post once, comment 3-5 times, send 2-3 connection requests — and within 90 days you'll have an active EV-industry network worth its weight in introductions.",
  },

  {
    slug: "how-to-get-an-ev-internship-practical-guide",
    title: "How to Get an EV Internship — A Practical Guide",
    excerpt:
      "EV internships are competitive but available. Here's how to find them, apply right and convert into a pre-placement offer.",
    categorySlug: "ev-networking",
    tags: ["EV internship", "internship", "EV career", "student"],
    lead:
      "An EV internship is one of the best ways to convert into a full-time offer. Even 8-12 weeks at an EV company adds enough to your CV to differentiate you from peers. Here's the playbook.",
    sections: [
      {
        h2: "Where the internships are",
        bullets: [
          "OEMs — Tata Motors EV, Mahindra Electric, Ather Energy, Ola Electric, Bajaj Auto EV, Hero MotoCorp",
          "Cell + battery — Reliance New Energy, Exide Energy Solutions, Amara Raja, Log9 Materials, Ion Energy, Vecmocon",
          "Charging — Tata Power EZ Charge, Statiq, ChargeZone, Bolt.Earth, Battery Smart, Sun Mobility",
          "Tier-1s — Bosch India, Continental India, KPIT, Tata Elxsi, Sona Comstar BLW",
          "Research — ARAI, ICAT, CSIR-CEERI, IIT Madras CBEEV",
          "Engineering services — KPIT, L&T Technology Services, HCLTech (best for IT switchers)",
        ],
      },
      {
        h2: "How to apply",
        bullets: [
          "Apply 6 months in advance for summer internships",
          "Apply directly through company career pages first",
          "Find a mid-level engineer at the target company on LinkedIn — ask for a referral with a 2-line note",
          "Use the emobility.careers internship feed",
          "Apply through your college TPO (campus drive)",
        ],
      },
      {
        h2: "What to demonstrate in your CV",
        bullets: [
          "One EV-relevant project (Simulink model, hardware build, OCPP simulator)",
          "Any related coursework (electrochemistry, power electronics, embedded systems)",
          "Programming languages if relevant (C, Python, MATLAB)",
          "Brief evidence of self-direction (a personal project, a hackathon, an internship review)",
        ],
      },
      {
        h2: "How to convert to a PPO",
        paragraphs: [
          "Internships at EV companies typically convert at 30-50% pre-placement offer rate. Show up early, document your work as you go, write a final 10-page report, and propose a follow-up project for after your internship ends. Build relationships with at least three engineers beyond your direct manager.",
        ],
      },
    ],
    conclusion:
      "An EV internship done well is the single highest-conversion entry path for fresh graduates. Pick a target company aggressively, prepare a project portfolio that matches their roadmap, and use a referral to surface above the noise.",
  },

  {
    slug: "ev-industry-events-india-where-to-network",
    title: "EV Industry Events in India — Where to Network and Get Hired",
    excerpt:
      "The most important EV industry events in India — Auto Expo, EVS, ChargeUP — where to attend, who to meet and how to follow up.",
    categorySlug: "ev-networking",
    tags: ["EV events India", "Auto Expo", "EV networking", "industry events"],
    lead:
      "EV industry events are where careers accelerate. A single conversation with the right Head of Engineering can short-circuit a 6-month job hunt. Here are the events that matter and how to work them well.",
    sections: [
      {
        h2: "Marquee events",
        bullets: [
          "Bharat Mobility Global Expo (biennial, Delhi) — every major Indian OEM is there",
          "EV India Expo (annual, Delhi) — heavy on charging-infra + Tier-1",
          "Bengaluru Tech Summit — software-side EV companies",
          "ARAI Symposium — research-side conversations",
          "ChargeUP Summit (annual) — charging-network operators + policy",
          "SIAM Annual Convention — auto-industry strategy + policy",
        ],
      },
      {
        h2: "Pre-event prep",
        bullets: [
          "Identify 10-15 specific companies and 20-30 people you want to meet",
          "Connect on LinkedIn beforehand with a specific reason ('I'll be at Bharat Mobility Expo — would love to ask 2 questions about your charging-infra roadmap')",
          "Update your CV to a single-page version printed on good paper",
          "Charge two phones (battery anxiety is real at busy expos)",
          "Wear something professional but plant-floor-comfortable",
        ],
      },
      {
        h2: "At the event",
        bullets: [
          "Visit your priority 10 booths in the first half-day",
          "Note one specific thing about each (product, hire announcement, partnership) for follow-up",
          "Speak with at least 3 different people at each — recruiters, engineers, product",
          "Collect contact info systematically (LinkedIn QR codes work better than business cards)",
        ],
      },
      {
        h2: "Within 48 hours",
        paragraphs: [
          "Send a personalised follow-up to every person you spoke with. Reference the specific conversation. Attach a relevant project if it makes sense. The follow-up matters more than the original conversation.",
        ],
      },
    ],
    conclusion:
      "Industry events are exhausting but high-leverage. Pick the 2 events per year most relevant to your track, prep thoroughly, and follow up within 48 hours. One good event can deliver 6-12 months of warm-network outreach.",
  },

  {
    slug: "mentorship-in-ev-industry-how-and-why",
    title: "Mentorship in the EV Industry — How and Why",
    excerpt:
      "Why every EV professional needs a mentor — and how to find, ask for and maintain a mentor relationship that compounds your career.",
    categorySlug: "ev-networking",
    tags: ["mentorship", "EV mentor", "career growth", "professional development"],
    lead:
      "Mentorship is the most under-rated career accelerator in the EV industry. A good mentor saves you 1-3 years of trial-and-error decisions. Here's how to find one, ask for help and build a relationship that compounds.",
    sections: [
      {
        h2: "Why mentors matter in EV specifically",
        paragraphs: [
          "EV careers branch in unintuitive ways — battery to charging, hardware to software, OEM to startup. A senior mentor who's been across two or three of these can compress your decision-making time by years.",
        ],
      },
      {
        h2: "Who makes a good mentor",
        bullets: [
          "Someone 8-12 years ahead of you (not too far, not too close)",
          "Someone in your target track, not adjacent",
          "Someone who's been at 2-3 companies (gives you outside view)",
          "Someone who writes / speaks publicly (signals willingness to teach)",
        ],
      },
      {
        h2: "How to ask",
        paragraphs: [
          "Don't ask 'will you be my mentor?' That's a heavy ask that triggers commitment anxiety. Instead, ask for a single 30-minute conversation on a specific question. If it goes well, ask if you can come back monthly with new questions. After 3-4 sessions, the relationship is implicitly mentorship.",
        ],
      },
      {
        h2: "How to maintain it",
        bullets: [
          "Prep specific questions before every call",
          "Send a summary email after — 'here's what I'm going to do based on what we discussed'",
          "Report back on outcomes 3-4 weeks later",
          "Refer people to them when relevant",
          "Never ask for a job referral until you've delivered on two pieces of advice",
        ],
      },
      {
        h2: "Where to find mentors",
        bullets: [
          "Through college alumni networks",
          "Through emobility.careers (the platform's mentor program)",
          "Through DIYguru's industry-mentor network",
          "By engaging consistently with someone's public writing",
        ],
      },
    ],
    conclusion:
      "A good mentor relationship pays back 10-50x the time you invest in maintaining it. Identify 2-3 potential mentors this month, ask each for a focused 30-minute conversation, and follow the maintenance pattern. Compound it for 24 months and your career trajectory changes.",
  },

  {
    slug: "linkedin-strategy-for-aspiring-ev-professionals",
    title: "LinkedIn Strategy for Aspiring EV Professionals",
    excerpt:
      "Most LinkedIn profiles are forgotten. Here's how to build one that recruiters actually find and engage with for EV roles.",
    categorySlug: "ev-networking",
    tags: ["LinkedIn EV", "LinkedIn strategy", "EV career", "professional brand"],
    lead:
      "Recruiters at every major EV company in India use LinkedIn as their primary sourcing channel. A well-optimised profile gets 5-10x the recruiter messages of a default one. Here's the playbook tailored to EV careers.",
    sections: [
      {
        h2: "Headline — your most-read 220 characters",
        paragraphs: [
          "Don't use 'Software Engineer at XYZ'. Use 'Embedded engineer | BMS firmware | ISO 26262 | building safety-critical battery systems'. Recruiter searches match on these keywords. Be specific.",
        ],
      },
      {
        h2: "About section — the 200-word hook",
        paragraphs: [
          "Lead with what you do, why it matters, and what you're looking for. Avoid generic statements about being passionate. Include 2-3 specific projects with numbers, a sentence on your domain (battery / motor / charging / software), and a clear closer ('Open to senior BMS firmware roles at battery-startup or OEM scale').",
        ],
      },
      {
        h2: "Experience — outcomes not duties",
        paragraphs: [
          "Each role: 1-line context + 3-5 bullets of measurable outcomes. 'Reduced BMS bring-up time from 3 weeks to 4 days by automating HIL test suite' beats 'worked on BMS firmware'.",
        ],
      },
      {
        h2: "Featured + projects",
        paragraphs: [
          "Pin 2-3 projects to your profile — Simulink model, GitHub repo, conference talk, published article. Recruiters scroll only the top fold; what's pinned matters most.",
        ],
      },
      {
        h2: "Activity — post once a week",
        bullets: [
          "Share a project you shipped",
          "Comment on a top engineer's post in your domain",
          "Repost an industry report with a 3-line summary",
          "Ask a substantive technical question",
        ],
      },
      {
        h2: "Skills + endorsements",
        paragraphs: [
          "List the top 10 skills relevant to your target role. Get colleagues to endorse the top 3. Skip the long tail — recruiters filter on the first 5 only.",
        ],
      },
    ],
    conclusion:
      "Spend 4 hours optimising your LinkedIn this weekend and 30 minutes per week posting + commenting. Within 90 days you'll start getting inbound recruiter messages from EV companies you actually want to work at.",
  },

  // ═══ Industry trends + resumes (8) ═══════════════════════════
  {
    slug: "ev-industry-india-2026-market-size-job-outlook",
    title: "EV Industry in India 2026 — Market Size and Job Outlook",
    excerpt:
      "Detailed 2026 market snapshot of India's EV industry — vehicle sales, charging-infra growth, battery production and hiring trends across categories.",
    categorySlug: "ev-industry-trends",
    tags: ["EV industry India", "EV market 2026", "EV jobs outlook", "EV statistics"],
    lead:
      "India's EV industry has crossed the inflection point. Two-wheelers are above 1M annual EV sales, three-wheeler EV adoption is past 60% in some segments, and the four-wheeler market is doubling each year. The jobs follow.",
    sections: [
      {
        h2: "Vehicle sales — where the volume is",
        bullets: [
          "Two-wheelers — 1.1M+ annual EV sales, 18% of category",
          "Three-wheelers — 700k+ annual EV sales, 60%+ in some segments",
          "Four-wheelers — 150k+ annual EV sales, 6% of category, growing fast",
          "Buses — 7,000+ annual EV deliveries, mostly to STUs",
          "Light commercial vehicles — emerging segment, 30k+ annual sales",
        ],
      },
      {
        h2: "Charging infrastructure",
        paragraphs: [
          "Public charging stations have crossed 22,000 nationally. The Bharat AC-001 and DC-001 standards are increasingly the deployed default. Tata Power, ChargeZone, Statiq, Adani TotalEnergies and the OMCs (HPCL, IOCL, BPCL) lead the rollout.",
        ],
      },
      {
        h2: "Battery cell production",
        paragraphs: [
          "Reliance, Ola, Tata AutoComp, Exide Energy Solutions and Amara Raja Energy are scaling gigafactories. Combined nameplate capacity is past 50 GWh with 200+ GWh targeted by 2030.",
        ],
      },
      {
        h2: "Job outlook",
        bullets: [
          "Battery manufacturing — 200,000+ roles expected by 2030",
          "Charging infrastructure — 1M+ roles (installer, technician, ops) by 2030",
          "Vehicle assembly — 150,000+ roles",
          "Service network — 300,000+ roles",
          "Software + data — 50,000+ roles",
          "Engineering R&D — 40,000+ roles",
        ],
      },
    ],
    conclusion:
      "India's EV industry will add a million jobs by 2030 across every collar type. The opportunity is broadest at the blue / grey-collar layer (service, charging, manufacturing) and most lucrative at the senior engineering layer (battery, BMS, power electronics, software).",
  },

  {
    slug: "top-10-ev-companies-in-india-hiring-right-now",
    title: "Top 10 EV Companies in India Hiring Right Now",
    excerpt:
      "The 10 EV companies hiring at scale in India in 2026 — across OEMs, charging, battery and Tier-1s, with role-mix and culture notes.",
    categorySlug: "ev-industry-trends",
    tags: ["EV companies hiring", "top EV companies India", "EV jobs", "OEM hiring"],
    lead:
      "If you're EV-job-hunting today, target these 10 companies. They're hiring across multiple functions, have predictable application pipelines, and offer salary bands at the top of market for their category.",
    sections: [
      {
        h2: "Tata Motors EV",
        paragraphs: [
          "The largest single EV employer in India. Hiring across engineering, manufacturing, service, sales and corporate functions. Best fit for engineers wanting OEM-scale resources with established stability.",
        ],
      },
      {
        h2: "Mahindra Electric",
        paragraphs: [
          "Strong hiring across 4W EV, 3W EV (last-mile mobility) and bus segments. Best fit for engineers from auto backgrounds wanting structured career progression.",
        ],
      },
      {
        h2: "Ather Energy",
        paragraphs: [
          "Bengaluru-headquartered 2W OEM with a software-led culture. Best fit for engineers + product managers + designers who want startup energy with maturity.",
        ],
      },
      {
        h2: "Ola Electric",
        paragraphs: [
          "Listed EV company with aggressive hiring across cell manufacturing (Gigafactory), software and sales. Best fit for engineers comfortable with high velocity and high accountability.",
        ],
      },
      {
        h2: "Reliance New Energy",
        paragraphs: [
          "Cell-manufacturing focus with ambitious 2030 targets. Best fit for cell + process + materials engineers seeking gigafactory scale.",
        ],
      },
      {
        h2: "Bajaj Auto EV",
        paragraphs: [
          "2W + 3W EV with the Chetak platform anchoring the line-up. Best fit for engineers wanting Tier-1 OEM scale in Pune.",
        ],
      },
      {
        h2: "Hero MotoCorp",
        paragraphs: [
          "Vida brand + tie-up with Ather + dealer-network scale. Best fit for engineers + sales managers seeking broad geographic coverage.",
        ],
      },
      {
        h2: "Tata Power EZ Charge",
        paragraphs: [
          "India's largest charging-network operator. Best fit for field engineers, site engineers, software engineers and operations leads.",
        ],
      },
      {
        h2: "Bosch India",
        paragraphs: [
          "Tier-1 supplier with deep EV portfolio across BMS, motor control, charging and ADAS. Best fit for engineers wanting structured training + global mobility.",
        ],
      },
      {
        h2: "KPIT / Tata Elxsi",
        paragraphs: [
          "ER&D giants serving every major global EV OEM. Best fit for software engineers wanting deep OEM exposure without joining one directly.",
        ],
      },
    ],
    conclusion:
      "Apply to 3-5 of these aggressively, with referrals where possible. Combined, they post 200+ open EV roles per month — your shortlist should include at least one OEM, one charging operator and one Tier-1 supplier.",
  },

  {
    slug: "ev-startups-india-hiring-trends-comp-structures",
    title: "EV Startups in India — Hiring Trends and Comp Structures",
    excerpt:
      "How EV startups in India structure compensation, hiring and career growth — and how to evaluate offers without getting burned.",
    categorySlug: "ev-industry-trends",
    tags: ["EV startups India", "startup compensation", "ESOPs", "EV career"],
    lead:
      "India's EV startup ecosystem has matured. There's serious money, real product traction, and an emerging set of multi-stage scale-ups. Working at one can compound your career — or wreck it — based on how you evaluate the offer. Here's the framework.",
    sections: [
      {
        h2: "Where startups concentrate",
        bullets: [
          "BMS + battery — Ion Energy, Vecmocon, Exponent Energy, Log9 Materials, RACE Energy",
          "Charging + grid — Bolt.Earth, Statiq, ChargeZone, Numocity, ElectricPe",
          "Battery swap + fleet — Sun Mobility, Battery Smart, ChargeUp",
          "OEMs (venture) — Ather, Ola, River, Eka, EarthEnergyEV",
          "Specialty hardware — Cellpropulsion, Pi Beam, AdverTV",
        ],
      },
      {
        h2: "Comp structure",
        paragraphs: [
          "Most startups offer base + variable + ESOPs. Variable is 10-20% for IC roles, higher for sales. ESOPs vest over 4 years with a 1-year cliff. Strike price is typically the last round's preferred-share price — at growth-stage startups this can be meaningful.",
        ],
      },
      {
        h2: "What to look at in an offer",
        bullets: [
          "ESOP percentage of fully-diluted equity (not just number of options)",
          "Last round valuation and likely next round timing",
          "Vesting cliff + schedule",
          "Liquidation preferences in the cap table",
          "Buyback policy if you leave",
          "Tax implications under Section 17(2)",
        ],
      },
      {
        h2: "Red flags",
        bullets: [
          "ESOP plan exists but is exclusive of recent rounds (constant dilution)",
          "Strike price is at preferred-share level with no discount",
          "No clear path to liquidity (no IPO timeline, no secondary)",
          "Founders unwilling to discuss cap table specifics",
          "Heavy reliance on FAME / PLI subsidies for unit economics",
        ],
      },
      {
        h2: "When startups make sense",
        paragraphs: [
          "If you're early-career (under 8 years), a well-funded EV startup compounds skills and reputation faster than a corporate equivalent. If you're senior (15+ years), join one only if the equity package + role scope materially exceeds your alternative.",
        ],
      },
    ],
    conclusion:
      "EV startups offer compressed-time learning that's hard to find elsewhere. Evaluate offers like an investor would — focus on the equity story, not the headline base. Done right, a startup role accelerates careers by 3-5 years.",
  },

  {
    slug: "resume-templates-ev-engineering-roles",
    title: "Resume Templates for EV Engineering Roles",
    excerpt:
      "Resume structure, sectioning and keyword strategy for EV engineering roles — battery, motor, BMS, power electronics, software.",
    categorySlug: "ev-careers",
    tags: ["EV resume", "engineering resume", "CV template", "EV jobs"],
    lead:
      "EV engineering resumes follow a recognisable structure that recruiters and hiring managers scan in 7-10 seconds. Get the structure right and the rest of your CV gets a fair read. Here's the template that works.",
    sections: [
      {
        h2: "Recommended structure",
        bullets: [
          "Top — Name, contact, LinkedIn URL, GitHub if relevant",
          "Headline — 1-line summary matching the JD (e.g. 'BMS Firmware Engineer | ISO 26262 ASIL-D | 6 years')",
          "Summary — 3-4 sentences with measurable outcomes",
          "Skills — 6-10 EV-relevant technical skills, role-matched",
          "Experience — reverse chronological, outcomes-first bullets",
          "Education — degree + institution + year",
          "Projects — 2-3 with brief description + link if available",
          "Certifications — AICTE, ASDC, SAE, ISO 26262 etc.",
        ],
      },
      {
        h2: "Keyword strategy",
        paragraphs: [
          "Most companies use ATS that ranks resumes by JD-keyword density. Mirror the JD's vocabulary: 'AUTOSAR Classic' not 'AUTOSAR', 'BMS firmware' not 'battery software', 'AIS 156' not 'battery safety standard'. Use the same case and acronym style.",
        ],
      },
      {
        h2: "Bullet pattern — outcomes over duties",
        bullets: [
          "✗ 'Worked on battery management system firmware'",
          "✓ 'Shipped BMS firmware for 2-product line covering 45,000 vehicles; reduced false-positive fault triggers 78% via Kalman-filter retuning'",
          "✗ 'Responsible for inverter design'",
          "✓ 'Designed 22-kW DC-DC converter using SiC MOSFETs; achieved 97.2% efficiency at 12-kW load, beating BOM target by 8%'",
        ],
      },
      {
        h2: "Common mistakes",
        bullets: [
          "Sending one generic CV to every role",
          "Skipping the headline (recruiters scan it first)",
          "Listing certifications without dates",
          "Putting hobbies above projects",
          "Overusing buzzwords ('passionate', 'team player', 'detail-oriented')",
        ],
      },
    ],
    conclusion:
      "A good EV engineering CV is 1-2 pages, role-matched per application, and outcome-rich in bullets. Spend 30 minutes per application customising — it triples interview-callback rate over generic submissions.",
  },

  {
    slug: "resume-templates-ev-manufacturing-service-roles",
    title: "Resume Templates for EV Manufacturing & Service Roles",
    excerpt:
      "Resume structure for EV manufacturing engineers, plant supervisors and service technicians — what recruiters and dealership managers look for.",
    categorySlug: "ev-careers",
    tags: ["service technician resume", "manufacturing resume", "EV CV", "ITI resume"],
    lead:
      "Manufacturing and service CVs are evaluated differently from engineering ones. Plant managers and service heads scan for certifications, hands-on metrics and OEM-specific experience. Here's the structure that works.",
    sections: [
      {
        h2: "Recommended structure",
        bullets: [
          "Name, contact, address (city + state — local hires preferred)",
          "Headline — '5-year EV service technician | ASDC L4 | Tata + Ather certified'",
          "Summary — 2-3 sentences with vehicle categories served + customer-satisfaction scores",
          "Certifications — at the top, prominently displayed",
          "Skills — diagnostic tools, HV safety, OEM-specific procedures",
          "Experience — reverse chronological, with concrete numbers (vehicles serviced, CSI, first-time-right)",
          "Education — ITI / diploma details",
          "Languages — local language + Hindi + English",
        ],
      },
      {
        h2: "Skills section — what to list",
        bullets: [
          "Vehicle categories — 2W EV, 3W EV, 4W EV, electric bus",
          "OEM diagnostic scanners — Tata DDS, Ather One App, MG iSMART, Ola DiagOS",
          "HV safety procedures — LOTO, insulated PPE, isolation testing",
          "Specific repairs you can do — BMS reset, controller swap, motor replacement",
          "Workshop-management tools — DMS systems, parts inventory",
        ],
      },
      {
        h2: "Manufacturing-specific additions",
        bullets: [
          "Plants worked at + machinery types (laser welder, automated line)",
          "OEE / first-time-right metrics you've moved",
          "Kaizens you've authored",
          "ASDC Level 4 / 5 certifications",
          "Six Sigma yellow / green belt if held",
        ],
      },
      {
        h2: "What to leave out",
        bullets: [
          "Marital status, age, photo (no longer expected)",
          "Generic skills (MS Office unless office-bound role)",
          "Multi-page padding — 1 page is enough",
          "References on the CV (provide on request)",
        ],
      },
    ],
    conclusion:
      "Manufacturing and service CVs work best when they front-load certifications and metrics. A dealer service head wants to see Tata or Ather certifications in the first 5 seconds. Make those visible at the top.",
  },

  {
    slug: "cover-letter-examples-ev-job-applications",
    title: "Cover Letter Examples for EV Job Applications",
    excerpt:
      "Cover letter templates and real examples for EV engineering, manufacturing, sales and product roles — with what makes them effective.",
    categorySlug: "ev-careers",
    tags: ["cover letter", "EV job application", "cover letter examples", "CV"],
    lead:
      "Most EV recruiters skim cover letters in 8-12 seconds. A great one signals fit + specificity + outcome thinking. Here's the structure plus four field-tested examples.",
    sections: [
      {
        h2: "Universal structure",
        bullets: [
          "1st para — hook: why this specific company, role and timing",
          "2nd para — your strongest 1-2 outcomes that match the JD",
          "3rd para — what you'd build / improve in the first 90 days",
          "Close — clear next step (interview ask, availability, link to portfolio)",
        ],
      },
      {
        h2: "Example 1 — BMS firmware engineer",
        paragraphs: [
          "'I noticed Ola Electric's recent Bharat Cell announcement and the in-house BMS architecture that goes with it. As a BMS firmware engineer with 6 years on ASIL-D pack controllers shipping in 80,000+ vehicles, I'd like to be part of that program. At Vecmocon I led the SOC-estimation rewrite that reduced range-prediction error from 4.8% to 1.6%. In the first 90 days at Ola I'd focus on cell-balancing latency on the Bharat Cell's larger format. Open to a 30-minute conversation — portfolio at github.com/...'",
        ],
      },
      {
        h2: "Example 2 — EV product manager",
        paragraphs: [
          "'Your fleet-product roadmap for 2026 (per the recent Bolt.Earth blog) aligns closely with the marketplace pricing work I led at Magenta Mobility last year. We A/B-tested 9 pricing variants across 1,200 chargers and lifted utilisation 23% without lowering per-session revenue. I'd love to bring that pricing-experimentation muscle to Bolt.Earth. Available for an exploratory chat any weekday — case-study deck attached.'",
        ],
      },
      {
        h2: "Example 3 — Service technician",
        paragraphs: [
          "'I am applying for the EV Service Technician role at Tata Motors EV Bengaluru workshop. I have 4 years of service experience at Ather authorised workshop (Chennai), holding ASDC Level 4 + Ather certification + Tata Motors Academy badge. Last year my workshop maintained 96% first-time-right and a 4.8 / 5 CSI. I am relocating to Bengaluru and can start within 2 weeks. Phone: ...'",
        ],
      },
      {
        h2: "What to avoid",
        bullets: [
          "Generic openers ('I am writing to apply for...')",
          "Re-stating your CV — add new context",
          "Long-winded narratives (max 250 words)",
          "Personal life details unless directly relevant",
        ],
      },
    ],
    conclusion:
      "A great cover letter takes 20 minutes per role but lifts callback rates 3-5x. Use the four-paragraph structure, customise the hook to the specific company, and end with a clear next step.",
  },

  {
    slug: "common-ev-career-mistakes-to-avoid",
    title: "Common EV Career Mistakes to Avoid",
    excerpt:
      "Twelve common mistakes that derail EV careers — and how to avoid them as a candidate, junior engineer or mid-career professional.",
    categorySlug: "ev-careers",
    tags: ["EV career mistakes", "career advice", "professional development", "EV jobs"],
    lead:
      "We watched hundreds of EV careers over the past five years. The same 12 mistakes recur — preventable, costly and rarely talked about. Here they are, with what to do instead.",
    sections: [
      {
        h2: "The 12 mistakes",
        bullets: [
          "Spreading thin across 4-5 EV tracks instead of going deep in 1-2",
          "Collecting certifications instead of shipping projects",
          "Taking the first offer without negotiating",
          "Ignoring ESOPs at venture-stage employers",
          "Job-hopping every 12 months for marginal raises",
          "Staying at the same company past the 4-year mark without rotation",
          "Not building public presence (LinkedIn, talks, articles)",
          "Underinvesting in functional safety + standards (ISO 26262, AIS 156)",
          "Skipping fundamentals (electrochemistry, control theory) in favour of tools",
          "Not finding a mentor in the first 5 years",
          "Burning out at 25-hour weeks during ramp phases",
          "Networking only when actively job-hunting",
        ],
      },
      {
        h2: "What to do instead",
        bullets: [
          "Pick 1-2 specialisms by year 2; go deep until year 5",
          "Ship 1-2 portfolio projects per year",
          "Always counter-offer; recruiters expect it",
          "Demand cap-table specifics before joining a venture-stage company",
          "Move when role plateaus, not when title plateaus",
          "Build internal mobility before considering external moves",
          "Post 1 substantive thing per month publicly",
          "Take SAE Functional Safety + read the AIS 156 amendments yearly",
          "Read 2 textbooks per year in your core specialism",
          "Find a mentor in year 2-3; refresh every 5 years",
          "Set sustainable cadence; over-work isn't a virtue",
          "Reach out to 2 new people per month all the time",
        ],
      },
    ],
    conclusion:
      "Most EV careers don't fail because of bad luck — they stall because of fixable mistakes. Audit your current trajectory against this list once a year. Three corrections per year compound into a transformed career over a decade.",
  },

  {
    slug: "how-to-get-job-ola-ather-tata-motors-ev-insider-guide",
    title: "How to Get a Job at Ola Electric, Ather Energy, Tata Motors EV — Insider Guide",
    excerpt:
      "Specific application strategy for the three biggest EV employers in India — how they recruit, what they look for, and how to stand out.",
    categorySlug: "ev-careers",
    tags: ["Ola Electric jobs", "Ather Energy jobs", "Tata Motors EV jobs", "EV careers"],
    lead:
      "Ola Electric, Ather Energy and Tata Motors EV are the three companies most candidates ask about. Each has a distinct hiring culture and process. Here's the insider playbook for each.",
    sections: [
      {
        h2: "Ola Electric — speed + ambition",
        paragraphs: [
          "Hires aggressively across cell manufacturing (Gigafactory at Krishnagiri), software (Bengaluru) and operations. Process is fast — final offers in 2-3 weeks for senior roles. Looks for engineers comfortable with high velocity, high ownership and operational intensity.",
          "Application tips: apply through the careers page first; use a referral via LinkedIn if you can find one. CV should lead with shipped outcomes — not just role titles. Be ready for a 2-3 round process including a strong founder interaction at senior levels.",
        ],
      },
      {
        h2: "Ather Energy — software-first culture",
        paragraphs: [
          "Hires across engineering (Bengaluru R&D), product, design and manufacturing (Hosur). Has the most software-led culture of any Indian EV OEM — strong on first principles, design quality, and engineering rigour.",
          "Application tips: portfolio matters more than at any other Indian OEM. Public engineering presence (GitHub, talks, articles) gives outsized lift. Process is structured, methodical, takes 4-8 weeks. Senior engineering rounds include system-design discussions and a project deep-dive.",
        ],
      },
      {
        h2: "Tata Motors EV — scale + stability",
        paragraphs: [
          "Hires across engineering (Pune, Bengaluru), manufacturing (Sanand, Pantnagar), service (national) and corporate functions. Most OEM-scale resources of any Indian EV company. Best fit for engineers wanting structured career paths and broad domain exposure.",
          "Application tips: campus + lateral routes both work; lateral is more competitive. Tier-1 engineering credentials carry weight (IIT / NIT / BITS). Process is multi-round — typically 3-5 rounds over 4-8 weeks. Tata-group values come up explicitly in behavioural rounds.",
        ],
      },
      {
        h2: "Cross-company tips",
        bullets: [
          "Build a track record before applying — at least one strong portfolio project in your target track",
          "Get a referral whenever possible — it raises callback rates 3-5x",
          "Customise CV per role; mirror JD vocabulary",
          "Apply to 3-5 specific roles at each company per year",
          "Prepare a 5-minute project pitch for senior-level interviews",
          "Reach out to engineers you respect on LinkedIn before applying — 2-line note, specific question",
        ],
      },
    ],
    conclusion:
      "Each of the three has its own pattern. Match your application style and project portfolio to the company culture. Persistence + customisation + referrals — that combination wins offers at all three within a 12-18 month focused effort.",
  },
];

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  console.log(`📰 Seeding ${ARTICLES.length} EV-career SEO articles...`);

  // Bootstrap categories. Idempotent — preserves existing names if
  // admin renamed them via /admin/articles.
  const categoryBySlug = new Map<string, { id: string }>();
  for (const cat of CATEGORIES) {
    const row = await db.articleCategory.upsert({
      where: { slug: cat.slug },
      create: { ...cat },
      update: { description: cat.description, sortOrder: cat.sortOrder },
      select: { id: true },
    });
    categoryBySlug.set(cat.slug, row);
  }
  console.log(`   → ${CATEGORIES.length} categories upserted`);

  // Attribution — first admin user. Required because Article.authorId
  // is non-nullable.
  const author = await db.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!author) {
    console.error("✗ No ADMIN user found — Article.authorId is required.");
    console.error("  Run pnpm db:seed first to create the admin user.");
    process.exit(1);
  }

  let upserted = 0;
  for (const spec of ARTICLES) {
    const body = buildBody(spec);
    const wc = wordCount(body);
    const readingTimeMins = Math.max(2, Math.round(wc / 220));
    const categoryId = categoryBySlug.get(spec.categorySlug)?.id ?? null;

    await db.article.upsert({
      where: { slug: spec.slug },
      create: {
        slug: spec.slug,
        title: spec.title,
        excerpt: spec.excerpt,
        body,
        tags: spec.tags,
        readingTimeMins,
        categoryId,
        authorId: author.id,
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date(),
      },
      update: {
        title: spec.title,
        excerpt: spec.excerpt,
        body,
        tags: spec.tags,
        readingTimeMins,
        categoryId,
      },
    });
    upserted += 1;
  }

  console.log(`✓ ${upserted} articles seeded · all PUBLISHED at /<slug>`);
}

main()
  .catch((err) => {
    console.error("✗ Article seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
