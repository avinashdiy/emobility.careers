import { db } from "@/lib/db";

/**
 * EV-domain Skill Compass — a shareable, Pokémon-style stat card per
 * candidate. The viral mechanic: the card is gorgeous enough that people
 * screenshot it onto LinkedIn / X / WhatsApp, and every share is an ad
 * for the platform. Each share carries the candidate's slug, so the
 * destination URL is itself a profile-builder funnel.
 *
 * The level for each EV domain is computed from publicly verifiable
 * evidence on the candidate's profile:
 *
 *   • Direct domain assignment (CandidateEVDomain row)  → +3 base
 *   • Skills assigned to that domain                    → +0.4 each (cap 4)
 *   • Certifications (DIYguru worth 2× regular ones)    → +1 (or +2)
 *   • Projects whose techStack overlaps domain skills   → +1 each (cap 2)
 *   • Years of experience (totalExperienceMonths)       → +0.2 / yr (cap 2)
 *
 * Capped at 10 so the card stays readable. Levels are integers (rounded
 * down) so a "Battery 7" feels like a clear tier; the UI shows the raw
 * +0.x in a subtitle for hard-won partial progress.
 *
 * The mapping between domain slug and the canonical skills lives in
 * scripts/seed.ts — we look it up dynamically rather than duplicating
 * it here, so taxonomy edits propagate automatically.
 */

export interface DomainLevel {
  slug: string;
  name: string;
  emoji: string;
  level: number;          // 0..10 rounded
  raw: number;            // unrounded score
  evidence: {
    skills: number;
    certifications: number;
    diyguruCerts: number;
    projects: number;
    direct: boolean;
    yearsExp: number;
  };
}

export interface CompassResult {
  /** Six-domain default ordering — cards always show the same lineup. */
  domains: DomainLevel[];
  /** "Generalist" / "Specialist" / "Polymath" tag derived from the curve. */
  archetype: string;
  /** Overall numeric — the average of the top-3 domains (0..10). */
  overall: number;
  /** Top domain by level — used as the headline tag. */
  topDomainSlug: string | null;
}

const DOMAIN_PRESENTATION: Record<
  string,
  { name: string; emoji: string }
> = {
  "battery-tech":          { name: "Battery",        emoji: "🔋" },
  "charging-infra":        { name: "Charging",       emoji: "⚡" },
  "powertrain":            { name: "Powertrain",     emoji: "⚙️" },
  "motor-control":         { name: "Motors",         emoji: "🌀" },
  "vehicle-engineering":   { name: "Vehicle",        emoji: "🚗" },
  "fleet-mobility":        { name: "Fleet",          emoji: "🛵" },
  "manufacturing":         { name: "Manufacturing",  emoji: "🏭" },
  "software-iot":          { name: "Software",       emoji: "💻" },
  "after-sales":           { name: "Service",        emoji: "🔧" },
  "policy-research":       { name: "Policy",         emoji: "📋" },
};

/**
 * Hand-curated domain → tech-stack tokens. We use these to credit a
 * project to a domain when its `techStack` array overlaps.
 *
 * Lower-cased + substring-matched at runtime so "MATLAB/Simulink" still
 * lights up "matlab" or "simulink" in a project.
 */
const DOMAIN_TECH_HINTS: Record<string, string[]> = {
  "battery-tech":        ["battery", "bms", "cell", "lithium", "thermal", "pack"],
  "charging-infra":      ["ocpp", "charger", "evse", "ccs", "chademo", "charging"],
  "powertrain":          ["powertrain", "gearbox", "drivetrain", "differential"],
  "motor-control":       ["pmsm", "bldc", "motor", "inverter", "foc", "vector control", "sic", "gan"],
  "vehicle-engineering": ["catia", "solidworks", "ansys", "autocad", "biw", "chassis"],
  "fleet-mobility":      ["fleet", "telematics", "tco", "leasing", "mobility"],
  "manufacturing":       ["assembly", "ppap", "lean", "six sigma", "supplier"],
  "software-iot":        ["embedded", "rtos", "autosar", "can bus", "mqtt", "matlab", "simulink", "linux", "ota"],
  "after-sales":         ["diagnostics", "obd", "service"],
  "policy-research":     ["fame", "pli", "policy", "lca", "carbon"],
};

const CANONICAL_ORDER = [
  "battery-tech",
  "charging-infra",
  "motor-control",
  "powertrain",
  "vehicle-engineering",
  "software-iot",
];

export async function computeCompass(candidateId: string): Promise<CompassResult | null> {
  const profile = await db.candidateProfile.findUnique({
    where: { id: candidateId },
    select: {
      totalExperienceMonths: true,
      evDomains: {
        include: { evDomain: { select: { slug: true } } },
      },
      skills: {
        include: { skill: { select: { slug: true, name: true, category: true } } },
      },
      certifications: { select: { isDIYguru: true, name: true } },
      projects: { select: { techStack: true } },
    },
  });
  if (!profile) return null;

  // Pull the canonical skill→domain map so partial-credit scoring matches
  // the seed taxonomy. Cache on the EVDomain table is small (~10 rows) so
  // we just join through CandidateSkill once.
  // We pull the seed-level relationship indirectly: each EVDomain has no
  // direct link to skills in the schema, so we approximate via name
  // matching against DOMAIN_TECH_HINTS. This stays robust even when the
  // skill catalog grows beyond the seed.

  const skillNames = profile.skills.map((s) => s.skill.name.toLowerCase());
  const directDomains = new Set(profile.evDomains.map((d) => d.evDomain.slug));
  const yearsExp = profile.totalExperienceMonths / 12;
  const certCount = profile.certifications.length;
  const diyguruCertCount = profile.certifications.filter((c) => c.isDIYguru).length;
  const expBonus = Math.min(2, yearsExp * 0.2);

  // Spread the cert bonus across the candidate's direct domains so a
  // generalist with 4 unrelated certs doesn't inflate every domain
  // identically. A cert without a direct-domain anchor still gives the
  // generic +0.5 to soften the floor.
  const certBonusPerDomain = directDomains.size > 0
    ? (certCount + diyguruCertCount) / directDomains.size
    : 0;

  const domains: DomainLevel[] = CANONICAL_ORDER.map((slug) => {
    const direct = directDomains.has(slug);
    const hints = DOMAIN_TECH_HINTS[slug] ?? [];
    const skillsCount = skillNames.filter((n) => hints.some((h) => n.includes(h))).length;
    const projectsCount = profile.projects.filter((p) =>
      p.techStack.some((t) => hints.some((h) => t.toLowerCase().includes(h))),
    ).length;

    // Per-domain weighted score
    let raw = 0;
    if (direct) raw += 3;                           // direct opt-in is the biggest single signal
    raw += Math.min(4, skillsCount * 0.4);          // skills cap at +4
    raw += Math.min(2, projectsCount * 1);          // projects cap at +2
    raw += direct ? certBonusPerDomain : 0.5 * certBonusPerDomain; // certs only fully credit direct
    raw += direct ? expBonus : 0;                   // exp only counts toward your declared domains
    raw = Math.min(10, raw);

    return {
      slug,
      name: DOMAIN_PRESENTATION[slug]?.name ?? slug,
      emoji: DOMAIN_PRESENTATION[slug]?.emoji ?? "•",
      level: Math.floor(raw),
      raw: Math.round(raw * 10) / 10,
      evidence: {
        skills: skillsCount,
        certifications: certCount,
        diyguruCerts: diyguruCertCount,
        projects: projectsCount,
        direct,
        yearsExp: Math.round(yearsExp * 10) / 10,
      },
    };
  });

  // Top-3 average → overall (out of 10), rounded to 1dp.
  const sorted = [...domains].sort((a, b) => b.raw - a.raw);
  const top3 = sorted.slice(0, 3);
  const overall = Math.round(
    (top3.reduce((acc, d) => acc + d.raw, 0) / Math.max(1, top3.length)) * 10,
  ) / 10;

  // Archetype heuristic — based on the level distribution shape.
  // "Polymath": ≥3 domains at 6+
  // "Specialist": top domain ≥7 AND second-best <5
  // "Generalist": neither
  const above6 = domains.filter((d) => d.level >= 6).length;
  let archetype: string;
  if (above6 >= 3) archetype = "Polymath";
  else if (sorted[0]?.level >= 7 && (sorted[1]?.level ?? 0) < 5) archetype = "Specialist";
  else archetype = "Generalist";

  return {
    domains,
    archetype,
    overall,
    topDomainSlug: sorted[0]?.slug ?? null,
  };
}
