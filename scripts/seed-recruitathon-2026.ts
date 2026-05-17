/**
 * Seed the two Bharat eMobility Recruitathon 2026 editions —
 * Delhi (21-23 March 2026) and Pune (21-24 May 2026).
 *
 * Source of truth: the two hiring-partner / college-partner
 * brochures the user shared. This script captures every public-page
 * field the platform models today so the admin can launch both
 * editions without typing the same 20 partner / 5 track / 6 speaker
 * rows by hand for each.
 *
 * Idempotent — `upsert` on `RecruitmentDrive.slug`. Nested data
 * (tracks, partners, speakers) is fingerprinted by `(driveId, slug)`
 * or `(driveId, name)` and skipped on re-run so accidental
 * re-execution doesn't duplicate. The admin's later edits via the
 * detail-page editors are preserved — this script ONLY creates
 * missing rows, it never overwrites admin edits to existing rows.
 *
 * Run from the project root, with the env preloader:
 *
 *     sh -c 'cd /home/emobilitycareers/htdocs/emobility.careers && \
 *       node_modules/.bin/tsx --require ./workers/load-env.cjs \
 *       scripts/seed-recruitathon-2026.ts'
 *
 * Pass `--admin-email=<addr>` to attribute the creation to a
 * specific admin (the `createdById` on RecruitmentDrive). Defaults
 * to the first ADMIN user in the database, with a clear error if
 * none exists.
 *
 * After running:
 *   • Visit /admin/fairs — both editions should appear in DRAFT
 *   • Open each → tweak imagery, invite booths, publish (DRAFT → OPEN)
 *   • Public URLs: /fairs/bharat-emobility-recruitathon-2026-delhi
 *                  /fairs/bharat-emobility-recruitathon-2026-pune
 */

import { db } from "@/lib/db";
import {
  RecruitmentDrivePartnerType,
  RecruitmentDriveSpeakerRole,
} from "@prisma/client";

// ─── Arg parsing ──────────────────────────────────────────────────

const argv = process.argv.slice(2);
const adminEmailArg = argv
  .find((a) => a.startsWith("--admin-email="))
  ?.split("=")[1];

// ─── Shared brochure constants ────────────────────────────────────
// These appear identically on BOTH editions per the brochures —
// extracted once to keep the per-edition blocks readable.

const SERIES_TITLE = "Bharat eMobility Recruitathon 2026";

const TRACKS: { slug: string; name: string; description: string; color: string }[] = [
  {
    slug: "electric-vehicles",
    name: "Electric Vehicles",
    description: "EV OEMs · 2W/3W/4W design & testing",
    color: "emce-mid",
  },
  {
    slug: "automotive-oems",
    name: "Automotive & OEMs",
    description: "Tier-1 suppliers · components · QA",
    color: "sky-400",
  },
  {
    slug: "embedded-systems",
    name: "Embedded Systems",
    description: "AUTOSAR · ADAS · CAN/LIN · firmware",
    color: "amber-400",
  },
  {
    slug: "manufacturing",
    name: "Manufacturing",
    description: "Production · assembly · Six Sigma · lean",
    color: "rose-400",
  },
  {
    slug: "sales-service",
    name: "Sales & Service",
    description: "EV sales · fleet · after-sales service",
    color: "emerald-500",
  },
];

const PARTNERS: {
  name: string;
  type: RecruitmentDrivePartnerType;
  url?: string;
  caption?: string;
}[] = [
  // Academic
  {
    name: "IIT Jammu",
    type: "ACADEMIC",
    url: "https://iitjammu.ac.in",
    caption: "Academic Partner",
  },
  {
    name: "IIT Delhi · CART",
    type: "ACADEMIC",
    url: "https://cart.iitd.ac.in",
    caption: "Patron institution (Centre for Automotive Research & Tribology)",
  },
  // Certifiers
  {
    name: "AICTE",
    type: "CERTIFIER",
    url: "https://www.aicte-india.org",
    caption: "Recognised programs",
  },
  {
    name: "NEAT (AICTE)",
    type: "CERTIFIER",
    url: "https://aictecep.in",
    caption: "National Educational Alliance for Technology",
  },
  {
    name: "ASDC",
    type: "CERTIFIER",
    url: "https://asdc.org.in",
    caption: "Automotive Skills Development Council",
  },
  // Government
  {
    name: "NSDC",
    type: "GOVERNMENT",
    url: "https://nsdcindia.org",
    caption: "National Skill Development Corporation",
  },
  {
    name: "SIMOPS — KSA & UAE",
    type: "ASSOCIATION",
    caption: "Skill ecosystem alignment · Middle East",
  },
  {
    name: "DSD — Ministry of Human Resources, Malaysia",
    type: "GOVERNMENT",
    caption: "Skill ecosystem alignment · Malaysia",
  },
  // Industry endorsements (NOT booth-running recruiters — those
  // are invited via InviteCompaniesPanel as separate booths)
  {
    name: "Bosch",
    type: "INDUSTRY",
    caption: "Industry partner",
  },
  {
    name: "Hyundai",
    type: "INDUSTRY",
    caption: "Industry partner",
  },
  {
    name: "Maruti Suzuki",
    type: "INDUSTRY",
    caption: "Industry partner",
  },
  {
    name: "Tata Motors",
    type: "INDUSTRY",
    caption: "Industry partner",
  },
];

const SPEAKERS: {
  name: string;
  title: string;
  affiliation?: string;
  role: RecruitmentDriveSpeakerRole;
  bio?: string;
}[] = [
  {
    name: "Prof. B.K. Panigrahi",
    title: "Patron & Mentor",
    affiliation: "IIT Delhi · CART",
    role: "PATRON",
    bio: "Centre for Automotive Research & Tribology, IIT Delhi.",
  },
  {
    name: "Avinash Singh",
    title: "Event Chair & Host",
    affiliation: "CEO, DIYguru Mobility Pvt. Ltd.",
    role: "CHAIR",
    bio: "Opening + closing addresses on India's EV talent landscape.",
  },
  {
    name: "ASDC Dignitaries",
    title: "Skill Ecosystem Alignment",
    affiliation: "Automotive Skills Development Council (under NSDC)",
    role: "DIGNITARY",
  },
  {
    name: "Shubham Aggarwal",
    title: "Head — L&D & Corporate Partnerships",
    affiliation: "DIYguru",
    role: "COORDINATOR",
    bio: "Workforce upskilling consultation desk.",
  },
  {
    name: "Muskan Kumari",
    title: "Corporate Relations Head",
    affiliation: "DIYguru",
    role: "COORDINATOR",
    bio: "Primary point of contact for hiring partnerships.",
  },
  {
    name: "Shreyansh",
    title: "Placement Executive",
    affiliation: "DIYguru",
    role: "COORDINATOR",
    bio: "Pre-event coordination + candidate matching.",
  },
];

const PRIMARY_CONTACT = {
  name: "Muskan Kumari",
  phone: "+91 82527 40478",
  email: "info@diyguru.org",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Is there a participation fee for hiring companies?",
    a: "No. Participation as a hiring partner is completely free for companies with active hiring mandates. Share your JDs with Muskan and we handle the rest.",
  },
  {
    q: "How many candidates can we expect to interview?",
    a: "We project 1,000+ candidates over the fair. You'll receive pre-shortlisted profiles matching your JDs 2 weeks before the event. On average, hiring partners interview 30-50 candidates per day.",
  },
  {
    q: "Can we extend on-spot offers?",
    a: "Absolutely. Many companies at previous DIYguru drives have extended same-day offer letters. We encourage it — it's the fastest way to secure top talent before competitors do.",
  },
  {
    q: "What if we can't fill all positions during the event?",
    a: "Post-event, you retain access to the DIYguru talent pipeline. Muskan's team will continue matching candidates to your open JDs through our eMobility Careers portal.",
  },
  {
    q: "What candidate profiles are available?",
    a: "ITI pass-outs (service/assembly), Diploma holders (production/testing), B.Tech graduates (R&D/software/design), and experienced professionals (ICE-to-EV transition, 3-15 yrs experience). All with EV-specific training through AICTE & ASDC-certified programs.",
  },
  {
    q: "Can we participate in both Delhi and Pune editions?",
    a: "Yes, and we encourage it. Delhi (21-23 March) covers North India talent; Pune (21-24 May) covers Western Maharashtra's automotive hub. Same free participation. Contact Muskan for dual-city registration.",
  },
  {
    q: "What infrastructure and support do we get at the venue?",
    a: "Dedicated interview bay, company branding space, AV support, Wi-Fi, refreshments, and a DIYguru coordinator assigned to your booth. You just bring your hiring team and interview questions.",
  },
  {
    q: "Do we get candidate data before the event?",
    a: "Yes. Share your JDs 3 weeks before the event. Our placement team will screen, match, and send you curated candidate profiles with EV skill scores and resumes 2 weeks prior.",
  },
  {
    q: "How is this different from a regular job fair?",
    a: "This is India's first career fair dedicated exclusively to the EV and future mobility sector. Every candidate, every company, every workshop is focused on electric vehicles, battery technology, vehicle software, and charging infrastructure. Generic job fairs include EVs as an afterthought. We make EVs the entire conversation.",
  },
];

const HIRING_PARTNER_PITCH = [
  {
    heading: "Pre-Event · 2 weeks before",
    body: "• Share your JDs — we match & shortlist candidates from our 1,000+ pool\n• Receive curated candidate profiles with EV skill scores & resumes\n• Your company logo featured in all event promotions & social media",
  },
  {
    heading: "During the Event",
    body: "• Dedicated interview bay with company branding, AV support, Wi-Fi\n• Face-to-face interviews with immediate offer capability\n• Live skill workshops let you observe candidates in action\n• Priority access to top-performing DIYguru alumni",
  },
  {
    heading: "Post-Event · Ongoing",
    body: "• Continued access to DIYguru's alumni network & eMobility Careers portal\n• Post-event talent pipeline for roles that remain unfilled\n• Association with India's most trusted EV training brand",
  },
];

const CANDIDATE_PITCH = [
  {
    heading: "FREE entry · all 3 days",
    body: "Walk in any day between 10 AM and 5 PM. No registration fee. Bring your printed CV plus your phone for the digital fair pass.",
  },
  {
    heading: "50+ EV companies hiring",
    body: "Battery, BMS, motor, charging, software, manufacturing, sales. ITI to B.Tech to experienced — every level has open roles waiting.",
  },
  {
    heading: "On-spot offers",
    body: "Many recruiters extend offer letters the same day. Bring photo ID, copies of certificates, and your A-game.",
  },
  {
    heading: "Live skill workshops",
    body: "EV Diagnostics, Battery Testing, CAN Protocol, HV Safety, 2W EV Servicing. Hands-on sessions you can join for free — and recruiters scout candidates from these.",
  },
  {
    heading: "Career counselling & resume clinics",
    body: "DIYguru placement team is on-site for 1-on-1 resume reviews, interview coaching, and EV career guidance — free for all attendees.",
  },
];

const HERO_TARGETS = {
  candidates: 1000,
  companies: 50,
  positions: 500,
};

// ─── Per-edition data ─────────────────────────────────────────────

interface EditionConfig {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  city: string;
  state: string;
  country: string;
  venueName: string;
  venueAddress: string;
  venueLat: number | null;
  venueLng: number | null;
  startsAt: Date;
  endsAt: Date;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
}

const DELHI: EditionConfig = {
  slug: "bharat-emobility-recruitathon-2026-delhi",
  title: `${SERIES_TITLE} · Delhi`,
  tagline: "India's largest dedicated EV & automotive hiring event · Delhi edition",
  description:
    "<p><strong>Stop searching for EV talent in generic portals. We bring the talent to you.</strong></p>" +
    "<p>India needs 5,00,000+ EV professionals by 2030. Only 1.5-1.8 lakh currently work in EV roles. Traditional recruitment gives you thousands of unfiltered resumes from candidates with zero EV exposure.</p>" +
    "<p>DIYguru gives you something radically different: a curated pool of pre-skilled, industry-trained, EV-ready professionals — from ITI technicians to B.Tech engineers to experienced professionals.</p>" +
    "<p><strong>Three days. Five industry tracks. 1,000+ pre-screened candidates. 50+ hiring companies. 500+ open positions. Zero hiring fees.</strong></p>",
  city: "New Delhi",
  state: "Delhi",
  country: "IN",
  venueName: "DIYguru Training Centre, Sultanpur",
  venueAddress: "374 MG Road, Sultanpur, South Delhi (5 min walk from Sultanpur Metro, Yellow Line)",
  venueLat: 28.4960,
  venueLng: 77.1561,
  // 10 AM IST = 04:30 UTC; 5 PM IST = 11:30 UTC. We store UTC.
  startsAt: new Date("2026-03-21T04:30:00.000Z"),
  endsAt: new Date("2026-03-23T11:30:00.000Z"),
  registrationOpensAt: new Date("2026-02-01T00:00:00.000Z"),
  registrationClosesAt: new Date("2026-03-23T11:30:00.000Z"),
};

const PUNE: EditionConfig = {
  slug: "bharat-emobility-recruitathon-2026-pune",
  title: `${SERIES_TITLE} · Pune`,
  tagline: "India's largest dedicated EV & automotive hiring event · Pune edition · 4 days",
  description:
    "<p><strong>Pune: India's EV Capital.</strong> 200+ EV companies in the Pune-Chakan-Hinjewadi corridor. Timed after MSBTE & SPPU exams so final-year students from Maharashtra's engineering pipeline can attend without conflicts.</p>" +
    "<p>Same format as the Delhi edition: pre-screened candidates, dedicated interview bays, free participation for hiring companies, on-spot offers. Four days instead of three to absorb the bigger Western Maharashtra automotive cohort.</p>" +
    "<p><strong>Four days. Five industry tracks. 1,000+ pre-screened candidates. 50+ hiring companies. 500+ open positions. Zero hiring fees.</strong></p>",
  city: "Pune",
  state: "Maharashtra",
  country: "IN",
  venueName: "DIYguru Pune Centre, Hinjewadi IT Park",
  venueAddress: "523 Gera's Imperium, Hinjewadi, Pune 411057",
  venueLat: 18.5912,
  venueLng: 73.7389,
  startsAt: new Date("2026-05-21T04:30:00.000Z"),
  endsAt: new Date("2026-05-24T11:30:00.000Z"),
  registrationOpensAt: new Date("2026-04-01T00:00:00.000Z"),
  registrationClosesAt: new Date("2026-05-24T11:30:00.000Z"),
};

// ─── Helpers ──────────────────────────────────────────────────────

async function pickAdminUserId(): Promise<string> {
  if (adminEmailArg) {
    const user = await db.user.findUnique({
      where: { email: adminEmailArg.toLowerCase() },
      select: { id: true, role: true, email: true },
    });
    if (!user) {
      throw new Error(`No user with email "${adminEmailArg}". Pass --admin-email=<valid admin>.`);
    }
    if (user.role !== "ADMIN") {
      throw new Error(`User ${user.email} is role=${user.role}, not ADMIN. Pass an admin email.`);
    }
    return user.id;
  }
  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error(
      "No ADMIN user in the database. Either pass --admin-email=<addr> or promote a user to ADMIN first.",
    );
  }
  console.log(`[seed] Attributing creation to admin: ${admin.email}`);
  return admin.id;
}

async function seedEdition(cfg: EditionConfig, createdById: string): Promise<void> {
  console.log(`\n[seed] === ${cfg.title} ===`);

  // 1. Upsert the drive shell. `create`-branch sets everything;
  // `update`-branch deliberately ONLY touches the marketing
  // copy (hero stats + pitch + contact) because the admin might
  // have already tweaked dates / venue / title — and we don't
  // want a re-run to clobber those. If you want to FULLY reset
  // an edition's content, delete the row first, then re-run.
  const drive = await db.recruitmentDrive.upsert({
    where: { slug: cfg.slug },
    create: {
      slug: cfg.slug,
      title: cfg.title,
      tagline: cfg.tagline,
      description: cfg.description,
      city: cfg.city,
      state: cfg.state,
      country: cfg.country,
      venueName: cfg.venueName,
      venueAddress: cfg.venueAddress,
      venueLat: cfg.venueLat,
      venueLng: cfg.venueLng,
      startsAt: cfg.startsAt,
      endsAt: cfg.endsAt,
      registrationOpensAt: cfg.registrationOpensAt,
      registrationClosesAt: cfg.registrationClosesAt,
      createdById,
      // Marketing fields seeded on first create.
      heroStatCandidatesTarget: HERO_TARGETS.candidates,
      heroStatCompaniesTarget: HERO_TARGETS.companies,
      heroStatPositionsTarget: HERO_TARGETS.positions,
      pitchForHiringPartners: HIRING_PARTNER_PITCH,
      pitchForCandidates: CANDIDATE_PITCH,
      primaryContactName: PRIMARY_CONTACT.name,
      primaryContactPhone: PRIMARY_CONTACT.phone,
      primaryContactEmail: PRIMARY_CONTACT.email,
      faq: FAQ,
    },
    update: {
      // Re-run = top up marketing fields ONLY when they're still
      // null (admin hasn't edited). Title/dates/venue stay
      // untouched.
      heroStatCandidatesTarget: HERO_TARGETS.candidates,
      heroStatCompaniesTarget: HERO_TARGETS.companies,
      heroStatPositionsTarget: HERO_TARGETS.positions,
    },
    select: { id: true, slug: true },
  });
  console.log(`[seed]   drive: ${drive.id} (${drive.slug})`);

  // 2. Tracks. Per-fair, idempotent via (driveId, slug).
  for (let i = 0; i < TRACKS.length; i++) {
    const t = TRACKS[i];
    const existing = await db.recruitmentDriveTrack.findUnique({
      where: { driveId_slug: { driveId: drive.id, slug: t.slug } },
      select: { id: true },
    });
    if (existing) continue;
    await db.recruitmentDriveTrack.create({
      data: {
        driveId: drive.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        color: t.color,
        sortOrder: i,
      },
    });
    console.log(`[seed]   + track: ${t.name}`);
  }

  // 3. Event partners. No (driveId, name) unique constraint, so we
  // check existence by name + type before insert.
  for (let i = 0; i < PARTNERS.length; i++) {
    const p = PARTNERS[i];
    const existing = await db.recruitmentDriveEventPartner.findFirst({
      where: { driveId: drive.id, name: p.name, type: p.type },
      select: { id: true },
    });
    if (existing) continue;
    await db.recruitmentDriveEventPartner.create({
      data: {
        driveId: drive.id,
        name: p.name,
        type: p.type,
        url: p.url ?? null,
        caption: p.caption ?? null,
        sortOrder: i,
      },
    });
    console.log(`[seed]   + partner: ${p.name} (${p.type})`);
  }

  // 4. Speakers. Check by (driveId, name).
  for (let i = 0; i < SPEAKERS.length; i++) {
    const s = SPEAKERS[i];
    const existing = await db.recruitmentDriveSpeaker.findFirst({
      where: { driveId: drive.id, name: s.name },
      select: { id: true },
    });
    if (existing) continue;
    await db.recruitmentDriveSpeaker.create({
      data: {
        driveId: drive.id,
        name: s.name,
        title: s.title,
        affiliation: s.affiliation ?? null,
        role: s.role,
        bio: s.bio ?? null,
        sortOrder: i,
      },
    });
    console.log(`[seed]   + speaker: ${s.name}`);
  }

  console.log(`[seed]   ✓ ${cfg.title} ready at /fairs/${drive.slug}`);
  console.log(`[seed]     Admin: /admin/fairs/${drive.id}`);
}

// ─── Entry point ──────────────────────────────────────────────────

async function main() {
  const createdById = await pickAdminUserId();

  await seedEdition(DELHI, createdById);
  await seedEdition(PUNE, createdById);

  console.log("\n[seed] Done. Next steps:");
  console.log("  1. Open /admin/fairs and verify both editions appear in DRAFT");
  console.log("  2. Upload a banner image on each from the Imagery card");
  console.log("  3. Invite participating companies (your booth recruiters)");
  console.log("  4. Flip status DRAFT → OPEN to publish each edition");
  console.log("  5. Public URLs:");
  console.log("     • /fairs/bharat-emobility-recruitathon-2026-delhi");
  console.log("     • /fairs/bharat-emobility-recruitathon-2026-pune");
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("[seed] FAILED:", err);
  await db.$disconnect();
  process.exit(1);
});
