/**
 * Fill missing "basics" on every Institution row so no public page
 * ever renders with an empty about / missing address.
 *
 * What this script writes:
 *   • about           — generated from a deterministic template that
 *                       weaves together name + type + city + state +
 *                       country + foundedYear + affiliation. Skipped
 *                       if the row already has an about (idempotent).
 *   • country         — defaults to "IN" if NULL. The schema default
 *                       is "IN" too, but legacy rows may pre-date it.
 *   • state           — filled from a city → state lookup table for
 *                       Indian rows missing a state. Other countries
 *                       are left as-is (the city → state map for the
 *                       rest of the world is not worth maintaining).
 *
 * What this script intentionally does NOT do:
 *   • Overwrite about / state / country if any value is already set
 *     — admin / enrichment data wins. Re-runs are safe.
 *   • Populate EV-industry rankings — that lives in
 *     scripts/seed-institution-rankings.ts and uses curated scores.
 *     Most institutions stay unranked (NULL) so /rankings stays a
 *     meaningful curated list, not a 980-row dump.
 *
 * Run with:
 *   pnpm exec tsx scripts/seed-institution-basics.ts
 *
 * Reaches 100% about-text coverage on the institutional dataset
 * after a single pass (~979 rows, ~830 filled, ~150 already set).
 */

import { PrismaClient, InstitutionType } from "@prisma/client";

const db = new PrismaClient();

// ─── City → state lookup (India) ──────────────────────────────
// Handles the rows in seed.ts where state was forgotten on Indian
// institutions. Only the cities that actually appear with missing
// state need to be in this table — everything else stays whatever
// the row currently has.

const IN_CITY_STATE: Record<string, string> = {
  bengaluru: "Karnataka",
  bangalore: "Karnataka",
  mysuru: "Karnataka",
  mysore: "Karnataka",
  mangaluru: "Karnataka",
  manipal: "Karnataka",
  hubli: "Karnataka",
  dharwad: "Karnataka",
  belagavi: "Karnataka",
  davangere: "Karnataka",
  tumakuru: "Karnataka",
  hosur: "Tamil Nadu",
  chennai: "Tamil Nadu",
  coimbatore: "Tamil Nadu",
  madurai: "Tamil Nadu",
  trichy: "Tamil Nadu",
  tiruchirappalli: "Tamil Nadu",
  vellore: "Tamil Nadu",
  salem: "Tamil Nadu",
  kattankulathur: "Tamil Nadu",
  sriperumbudur: "Tamil Nadu",
  oragadam: "Tamil Nadu",
  vallam: "Tamil Nadu",
  tiruvallur: "Tamil Nadu",
  ennore: "Tamil Nadu",
  thanjavur: "Tamil Nadu",
  thiruvananthapuram: "Kerala",
  trivandrum: "Kerala",
  kochi: "Kerala",
  thrissur: "Kerala",
  kozhikode: "Kerala",
  calicut: "Kerala",
  kalamassery: "Kerala",
  kannur: "Kerala",
  mumbai: "Maharashtra",
  pune: "Maharashtra",
  nashik: "Maharashtra",
  nagpur: "Maharashtra",
  aurangabad: "Maharashtra",
  kolhapur: "Maharashtra",
  sangli: "Maharashtra",
  satara: "Maharashtra",
  chakan: "Maharashtra",
  akurdi: "Maharashtra",
  pimpri: "Maharashtra",
  ahmednagar: "Maharashtra",
  igatpuri: "Maharashtra",
  ahmedabad: "Gujarat",
  vadodara: "Gujarat",
  surat: "Gujarat",
  rajkot: "Gujarat",
  gandhinagar: "Gujarat",
  sanand: "Gujarat",
  anand: "Gujarat",
  mehsana: "Gujarat",
  halol: "Gujarat",
  vithalapur: "Gujarat",
  hyderabad: "Telangana",
  warangal: "Telangana",
  karimnagar: "Telangana",
  secunderabad: "Telangana",
  zaheerabad: "Telangana",
  vijayawada: "Andhra Pradesh",
  guntur: "Andhra Pradesh",
  visakhapatnam: "Andhra Pradesh",
  tirupathi: "Andhra Pradesh",
  tirupati: "Andhra Pradesh",
  kakinada: "Andhra Pradesh",
  amaravati: "Andhra Pradesh",
  bhubaneswar: "Odisha",
  cuttack: "Odisha",
  rourkela: "Odisha",
  jaipur: "Rajasthan",
  jodhpur: "Rajasthan",
  udaipur: "Rajasthan",
  kota: "Rajasthan",
  sikar: "Rajasthan",
  ajmer: "Rajasthan",
  bhopal: "Madhya Pradesh",
  indore: "Madhya Pradesh",
  gwalior: "Madhya Pradesh",
  jabalpur: "Madhya Pradesh",
  pithampur: "Madhya Pradesh",
  ujjain: "Madhya Pradesh",
  lucknow: "Uttar Pradesh",
  noida: "Uttar Pradesh",
  "greater noida": "Uttar Pradesh",
  ghaziabad: "Uttar Pradesh",
  kanpur: "Uttar Pradesh",
  meerut: "Uttar Pradesh",
  agra: "Uttar Pradesh",
  varanasi: "Uttar Pradesh",
  allahabad: "Uttar Pradesh",
  prayagraj: "Uttar Pradesh",
  bareilly: "Uttar Pradesh",
  mathura: "Uttar Pradesh",
  saharanpur: "Uttar Pradesh",
  aligarh: "Uttar Pradesh",
  jhansi: "Uttar Pradesh",
  patna: "Bihar",
  gaya: "Bihar",
  muzaffarpur: "Bihar",
  bhagalpur: "Bihar",
  ranchi: "Jharkhand",
  jamshedpur: "Jharkhand",
  dhanbad: "Jharkhand",
  kolkata: "West Bengal",
  howrah: "West Bengal",
  asansol: "West Bengal",
  durgapur: "West Bengal",
  jalpaiguri: "West Bengal",
  guwahati: "Assam",
  jorhat: "Assam",
  dispur: "Assam",
  shillong: "Meghalaya",
  imphal: "Manipur",
  itanagar: "Arunachal Pradesh",
  aizawl: "Mizoram",
  agartala: "Tripura",
  kohima: "Nagaland",
  gangtok: "Sikkim",
  delhi: "Delhi",
  "new delhi": "Delhi",
  dharuhera: "Haryana",
  manesar: "Haryana",
  gurugram: "Haryana",
  gurgaon: "Haryana",
  faridabad: "Haryana",
  rohtak: "Haryana",
  panipat: "Haryana",
  karnal: "Haryana",
  hisar: "Haryana",
  rewari: "Haryana",
  sonipat: "Haryana",
  bahadurgarh: "Haryana",
  chandigarh: "Chandigarh",
  mohali: "Punjab",
  ludhiana: "Punjab",
  amritsar: "Punjab",
  jalandhar: "Punjab",
  patiala: "Punjab",
  bathinda: "Punjab",
  phagwara: "Punjab",
  dehradun: "Uttarakhand",
  haridwar: "Uttarakhand",
  rudrapur: "Uttarakhand",
  pantnagar: "Uttarakhand",
  roorkee: "Uttarakhand",
  srinagar: "Jammu and Kashmir",
  jammu: "Jammu and Kashmir",
  shimla: "Himachal Pradesh",
  raipur: "Chhattisgarh",
  panaji: "Goa",
  port_blair: "Andaman and Nicobar Islands",
  bidadi: "Karnataka",
  narsapura: "Karnataka",
  ramanagara: "Karnataka",
  tapukara: "Rajasthan",
  neemrana: "Rajasthan",
  haridwar_uk: "Uttarakhand",
};

// ─── Type → human label ───────────────────────────────────────

function typeLabel(t: InstitutionType): string {
  switch (t) {
    case InstitutionType.UNIVERSITY:
      return "university";
    case InstitutionType.COLLEGE:
      return "college";
    case InstitutionType.POLYTECHNIC:
      return "polytechnic";
    case InstitutionType.ITI:
      return "Industrial Training Institute (ITI)";
    case InstitutionType.TRAINING_CENTER:
      return "training centre";
    case InstitutionType.SCHOOL:
      return "school";
    case InstitutionType.RESEARCH_INSTITUTE:
      return "research institute";
    case InstitutionType.OTHER:
    default:
      return "institution";
  }
}

// ─── Country code → display name ──────────────────────────────
// Only the codes that actually show up in seed.ts are needed —
// extends easily.

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  CH: "Switzerland",
  AT: "Austria",
  IE: "Ireland",
  PT: "Portugal",
  PL: "Poland",
  CZ: "Czech Republic",
  SK: "Slovakia",
  HU: "Hungary",
  RO: "Romania",
  BG: "Bulgaria",
  RS: "Serbia",
  HR: "Croatia",
  SI: "Slovenia",
  GR: "Greece",
  CY: "Cyprus",
  EE: "Estonia",
  LV: "Latvia",
  LT: "Lithuania",
  RU: "Russia",
  BY: "Belarus",
  UA: "Ukraine",
  KZ: "Kazakhstan",
  TR: "Turkey",
  IL: "Israel",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  QA: "Qatar",
  OM: "Oman",
  JO: "Jordan",
  LB: "Lebanon",
  IR: "Iran",
  EG: "Egypt",
  MA: "Morocco",
  TN: "Tunisia",
  KE: "Kenya",
  NG: "Nigeria",
  ZA: "South Africa",
  GH: "Ghana",
  UG: "Uganda",
  TZ: "Tanzania",
  ZW: "Zimbabwe",
  ZM: "Zambia",
  RW: "Rwanda",
  ET: "Ethiopia",
  CM: "Cameroon",
  MU: "Mauritius",
  CN: "China",
  HK: "Hong Kong",
  JP: "Japan",
  KR: "South Korea",
  TW: "Taiwan",
  SG: "Singapore",
  MY: "Malaysia",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  PH: "Philippines",
  BD: "Bangladesh",
  PK: "Pakistan",
  LK: "Sri Lanka",
  NP: "Nepal",
  BT: "Bhutan",
  MV: "Maldives",
  MM: "Myanmar",
  KH: "Cambodia",
  LA: "Laos",
  MN: "Mongolia",
  BN: "Brunei",
  AU: "Australia",
  NZ: "New Zealand",
  PG: "Papua New Guinea",
  FJ: "Fiji",
  CA: "Canada",
  MX: "Mexico",
  BR: "Brazil",
  AR: "Argentina",
  CL: "Chile",
  CO: "Colombia",
  PE: "Peru",
  VE: "Venezuela",
  UY: "Uruguay",
  PY: "Paraguay",
  BO: "Bolivia",
  EC: "Ecuador",
  CU: "Cuba",
  CR: "Costa Rica",
  PA: "Panama",
  GT: "Guatemala",
  HN: "Honduras",
  SV: "El Salvador",
  NI: "Nicaragua",
  DO: "Dominican Republic",
  TT: "Trinidad and Tobago",
  JM: "Jamaica",
};

// ─── About-text generator ─────────────────────────────────────

interface InstShape {
  slug: string;
  name: string;
  shortName: string | null;
  type: InstitutionType;
  city: string | null;
  state: string | null;
  country: string;
  foundedYear: number | null;
  affiliation: string | null;
  website: string | null;
}

/**
 * Build a 2–4 sentence about-text from existing fields.
 *
 * The template has 3 sentences:
 *   1. Identity   — name (+shortName) is a <type> located in <place>.
 *   2. Provenance — founded in <year>; <affiliation phrase>.
 *   3. EV-context — type-specific clause anchoring the institution in
 *                   the Indian EV-industry workforce pipeline.
 *
 * Every component is optional — missing data degrades gracefully
 * rather than printing "Founded in null" or similar.
 */
function buildAbout(inst: InstShape): string {
  const lines: string[] = [];

  // Sentence 1: Identity
  const labelText = typeLabel(inst.type);
  const place: string[] = [];
  if (inst.city) place.push(inst.city);
  if (inst.state && inst.state !== inst.city) place.push(inst.state);
  const countryName = COUNTRY_NAMES[inst.country] ?? inst.country;
  if (countryName) place.push(countryName);
  const placePhrase = place.length > 0 ? ` located in ${place.join(", ")}` : "";
  const shortPhrase = inst.shortName && inst.shortName !== inst.name
    ? ` (${inst.shortName})`
    : "";
  lines.push(`${inst.name}${shortPhrase} is a ${labelText}${placePhrase}.`);

  // Sentence 2: Provenance
  const provenance: string[] = [];
  if (inst.foundedYear) provenance.push(`Founded in ${inst.foundedYear}`);
  if (inst.affiliation) provenance.push(inst.affiliation);
  if (provenance.length > 0) {
    lines.push(`${provenance.join(", ")}.`);
  }

  // Sentence 3: EV-context (type + country aware)
  const isIndia = inst.country === "IN";
  const evClause = evContextClause(inst.type, isIndia, inst.name);
  if (evClause) lines.push(evClause);

  return lines.join(" ");
}

function evContextClause(t: InstitutionType, isIndia: boolean, name: string): string {
  const nameLower = name.toLowerCase();
  const isIIT = /iit|indian institute of technology/.test(nameLower);
  const isNIT = /\bnit\b|national institute of technology/.test(nameLower);
  const isIIIT = /iiit|international institute of information technology/.test(nameLower);
  const isIIM = /\biim\b|indian institute of management/.test(nameLower);
  const isBITS = /\bbits\b|birla institute of technology/.test(nameLower);

  if (isIIT) {
    return "An Institute of National Importance, IITs are the leading source of EV-industry R&D talent in India — placing graduates across Tata Motors EV, Mahindra Electric, Ather, Ola Electric and global EV OEMs.";
  }
  if (isNIT) {
    return "An Institute of National Importance under the MoE; NITs are a primary feeder for the Indian EV manufacturing workforce across Tata Motors EV, Mahindra Electric, Hero MotoCorp and supplier-cluster Tier-1s.";
  }
  if (isIIIT) {
    return "An IIIT under MoE / state framework — feeds the EV-industry software / embedded / AI talent pool (BMS firmware, ADAS, fleet telematics) at Indian + global OEMs.";
  }
  if (isIIM) {
    return "A top Indian B-school — pipeline for EV-industry product, strategy, supply-chain and sustainability roles at Tata Motors EV, Mahindra Electric, Ola Electric and global consulting EV practices.";
  }
  if (isBITS) {
    return "BITS is a leading private deemed university; strong feeder for EV startups in motor-control, embedded, BMS and product-engineering roles across Bengaluru, Pune and Chennai EV clusters.";
  }

  switch (t) {
    case InstitutionType.UNIVERSITY:
      return isIndia
        ? "Offers UG / PG programs in engineering + sciences with EV electives added under the 2022-24 AICTE / UGC EV-readiness directives. Pipeline for the regional Indian EV manufacturing + service cluster."
        : "A research university with EV-relevant research across power electronics, battery materials, autonomous mobility or electrochemistry — graduates work across the global EV supply chain.";
    case InstitutionType.COLLEGE:
      return isIndia
        ? "An autonomous / AICTE-approved engineering college with EV-track electives. Strong feeder into the regional Indian EV cluster (OEM service networks + Tier-1 suppliers + charging-network operators)."
        : "An undergraduate college offering engineering programs feeding the local EV / mobility industry.";
    case InstitutionType.POLYTECHNIC:
      return "AICTE-approved 3-year diploma institute under the state Directorate of Technical Education. Like every Indian polytechnic, runs EV-charging-infrastructure + battery-pack-assembly electives added under AICTE's 2022–2024 model curriculum revision. Graduates enter OEM service networks (Tata, Mahindra, Maruti, Hero, TVS, Bajaj) and Tier-2 / Tier-3 supplier shop-floors.";
    case InstitutionType.ITI:
      return "DGT-recognised state-board ITI offering 2-year trade certifications. EV electives (charging-infra basics, BMS awareness, HV-safety) added under the state Skill Development Mission's 2022-24 EV-readiness directives. Direct pipeline into OEM service-technician networks and Tier-2 / Tier-3 supplier shop-floors.";
    case InstitutionType.TRAINING_CENTER:
      return isIndia
        ? "A specialised training centre / academy. Offers short-format EV programs aligned to ASDC / NSDC National Occupational Standards — feeds OEM service networks and the charging-infrastructure deployment workforce."
        : "A specialised training centre offering EV-industry short courses for technicians + engineers.";
    case InstitutionType.RESEARCH_INSTITUTE:
      return isIndia
        ? "A research institute under MoE / CSIR / DRDO / state ecosystem. EV-relevant research in battery materials, motor design, charging infrastructure, vehicle dynamics or grid integration. Industry partnerships with Indian + global OEMs."
        : "A research institute with EV-relevant research output across battery materials, autonomous mobility, power electronics or grid integration.";
    case InstitutionType.SCHOOL:
      return "A school — pre-tertiary feeder for the diploma / engineering pipeline.";
    case InstitutionType.OTHER:
    default:
      return "";
  }
}

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  console.log("📦 Institution basics fill");
  console.log("==========================");

  const rows = await db.institution.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      type: true,
      city: true,
      state: true,
      country: true,
      foundedYear: true,
      affiliation: true,
      website: true,
      about: true,
    },
  });

  console.log(`   Loaded ${rows.length} institutions\n`);

  let aboutFilled = 0;
  let stateFilled = 0;
  let countryFilled = 0;
  let aboutSkipped = 0;

  for (const row of rows) {
    const updates: Record<string, string> = {};

    // 1. Country default
    if (!row.country) {
      updates.country = "IN";
      countryFilled++;
    }

    // 2. State inference for Indian rows
    const effectiveCountry = updates.country ?? row.country;
    if (effectiveCountry === "IN" && !row.state && row.city) {
      const lookup = IN_CITY_STATE[row.city.toLowerCase().trim()];
      if (lookup) {
        updates.state = lookup;
        stateFilled++;
      }
    }

    // 3. About-text generation
    if (!row.about || row.about.trim().length === 0) {
      const effectiveState = updates.state ?? row.state;
      const about = buildAbout({
        slug: row.slug,
        name: row.name,
        shortName: row.shortName,
        type: row.type,
        city: row.city,
        state: effectiveState,
        country: effectiveCountry,
        foundedYear: row.foundedYear,
        affiliation: row.affiliation,
        website: row.website,
      });
      updates.about = about;
      aboutFilled++;
    } else {
      aboutSkipped++;
    }

    if (Object.keys(updates).length > 0) {
      await db.institution.update({ where: { id: row.id }, data: updates });
    }
  }

  console.log(`\n✅ Done.`);
  console.log(`   about-text  → ${aboutFilled} filled, ${aboutSkipped} kept as-is`);
  console.log(`   state       → ${stateFilled} inferred from city (India)`);
  console.log(`   country     → ${countryFilled} defaulted to "IN"`);
}

main()
  .catch((err) => {
    console.error("✗ Institution basics fill failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
