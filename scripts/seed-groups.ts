/**
 * Wave A #5 seed — initial EV Community Groups.
 *
 * Idempotent: upserts by slug. Re-run to update copy / banners /
 * descriptions without re-creating rows.
 *
 *   npx tsx scripts/seed-groups.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

interface GroupSeed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  evDomainSlug: string;
  rules?: string;
  sortOrder: number;
}

const GROUPS: GroupSeed[] = [
  {
    slug: "battery-engineers",
    name: "Battery Engineers",
    tagline: "Cell chemistry, pack design, BMS, and everything that lives in the high-voltage box.",
    description:
      "For engineers working on Li-ion cells, pack architecture, thermal management, and BMS firmware in India's EV industry. Share what you're seeing in cells from Indian giga-factories, debug pack faults, swap notes on AIS-156 compliance.",
    evDomainSlug: "battery-tech",
    sortOrder: 10,
    rules:
      "Be specific — generic posts about 'EV adoption' aren't a fit here. Share what you've actually shipped or learned.\nNo recruiter spam. Use the platform's job board for that.\nNo cell-vendor pitches. Independent analyses welcome.",
  },
  {
    slug: "charging-infrastructure",
    name: "Charging Infrastructure",
    tagline: "CCS, OCPP, BIS norms, station ops, V2G — the network behind every EV.",
    description:
      "Charge-point operators, hardware engineers, and software folk building the public + fleet charging network. Discuss CCS2 vs Bharat DC-001, OCPP 2.0.1 rollouts, station downtime postmortems, and the BIS 17017 maze.",
    evDomainSlug: "charging-infra",
    sortOrder: 20,
    rules: "Operational war stories welcome. Vendor pitches not.",
  },
  {
    slug: "bms-design",
    name: "BMS Design",
    tagline: "Passive vs active balancing, AFE-IC choices, SOC estimation, functional safety.",
    description:
      "Deep dive on Battery Management Systems — circuit design, firmware, SOC/SOH algorithms, ISO 26262 functional-safety practice, and the AFE-IC market (LTC68xx vs BQ7693 vs MAX17841).",
    evDomainSlug: "battery-tech",
    sortOrder: 11,
  },
  {
    slug: "motor-and-drives",
    name: "Motor & Drives",
    tagline: "PMSM, induction, FOC, SVPWM, inverter design — the propulsion stack.",
    description:
      "Motor + inverter + drivetrain engineers. Topics include FOC tuning, switch selection (SiC vs IGBT), thermal limits, gearbox tradeoffs, noise + harmonics, regen calibration.",
    evDomainSlug: "motor-control",
    sortOrder: 30,
  },
  {
    slug: "vehicle-engineering",
    name: "Vehicle Engineering",
    tagline: "BIW, packaging, vehicle dynamics, EE architecture, ADAS.",
    description:
      "Whole-vehicle integration — BIW, packaging, vehicle dynamics, EE architecture, ADAS calibration, AUTOSAR adoption across Indian OEMs.",
    evDomainSlug: "vehicle-engineering",
    sortOrder: 40,
  },
  {
    slug: "fleet-and-mobility",
    name: "Fleet & Mobility",
    tagline: "Last-mile, 3W, 2W rentals, telematics, route planning, battery-swap.",
    description:
      "Fleet operators, telematics engineers, and mobility startup folk. Discuss commercial-grade reliability, last-mile economics, swap-station rollouts, and the regulatory edge cases India keeps throwing at us.",
    evDomainSlug: "fleet-mobility",
    sortOrder: 50,
  },
  {
    slug: "ev-software-and-iot",
    name: "EV Software & IoT",
    tagline: "VCU firmware, AUTOSAR, OTA, telematics, OCPP backends, app builders.",
    description:
      "For the software-side of EVs — VCU firmware, AUTOSAR, OTA pipelines, telematics, OCPP backends, mobile-app engineers building the charging + fleet apps. ISO 26262 + cybersecurity (ISO/SAE 21434) discussion welcome.",
    evDomainSlug: "software-iot",
    sortOrder: 60,
  },
  {
    slug: "manufacturing-and-supply-chain",
    name: "Manufacturing & Supply Chain",
    tagline: "Cell-to-pack ramp, line design, vendor management, FAME-II, PMP rules.",
    description:
      "Manufacturing engineers, plant managers, and supply-chain leads building India's EV production base. Discuss cell-to-pack ramp, line design, vendor management, and the FAME-II + PMP compliance maze.",
    evDomainSlug: "manufacturing",
    sortOrder: 70,
  },
  {
    slug: "ev-service-technicians",
    name: "EV Service Technicians",
    tagline: "Field diagnostics, high-voltage safety, retrofit, after-sales.",
    description:
      "For service-bay technicians, field engineers, and aftermarket specialists. Diagnostic war stories, retrofit tips, high-voltage safety practice, ASDC + DIYguru programmes.",
    evDomainSlug: "after-sales",
    sortOrder: 80,
  },
  {
    slug: "ev-freshers",
    name: "EV Freshers",
    tagline: "Just entering the EV industry — first jobs, internships, study plans.",
    description:
      "For students + fresh grads making the EV transition. Ask anything — DIYguru programmes, internship hunts, CV reviews, which OEMs are hiring freshers, how to upskill from auto-engineering to EV without a complete pivot.",
    evDomainSlug: "policy-research",
    sortOrder: 90,
  },
];

async function main() {
  console.log("Seeding EV community groups…");
  for (const g of GROUPS) {
    await db.group.upsert({
      where: { slug: g.slug },
      create: g,
      update: {
        name: g.name,
        tagline: g.tagline,
        description: g.description,
        evDomainSlug: g.evDomainSlug,
        rules: g.rules ?? null,
        sortOrder: g.sortOrder,
      },
    });
  }
  console.log(`  ${GROUPS.length} groups upserted`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
