/**
 * Wave C seed — Credential catalog + canonical EV skill assessments.
 *
 * Idempotent. Each upsert keys on a stable slug so re-running this
 * script after the schema changes is safe (and is the recommended way
 * to update copy / questions after launch).
 *
 *   npx tsx scripts/seed-wave-c.ts
 *
 * Wave A/B seed data lives in scripts/seed.ts; this one stays separate
 * so it can ship to prod without touching the broader bootstrap script.
 */
import { PrismaClient, AssessmentType, SkillAssessmentDifficulty } from "@prisma/client";

const db = new PrismaClient();

// ─── #29 Credential catalog ─────────────────────────────────────────
//
// The canonical EV-industry credentials a recruiter can filter on +
// a candidate can claim. We start with the highest-signal ones —
// admin can extend later. Each row's slug is permanent; the name
// and authority can be edited.

const CREDENTIALS: {
  slug: string;
  name: string;
  authority: string;
  evDomainSlug: string;
  sortOrder: number;
}[] = [
  { slug: "arai", name: "ARAI Certified", authority: "Automotive Research Association of India", evDomainSlug: "vehicle-engineering", sortOrder: 10 },
  { slug: "fame-ii", name: "FAME-II Eligible", authority: "Ministry of Heavy Industries (PMP-mandated)", evDomainSlug: "policy-research", sortOrder: 20 },
  { slug: "bis-is17017", name: "BIS IS 17017", authority: "Bureau of Indian Standards (AC/DC charging)", evDomainSlug: "charging-infra", sortOrder: 30 },
  { slug: "bis-is16046", name: "BIS IS 16046", authority: "BIS (Li-ion safety for portable applications)", evDomainSlug: "battery-tech", sortOrder: 40 },
  { slug: "asdc-l3", name: "ASDC Level 3", authority: "Automotive Skills Development Council", evDomainSlug: "after-sales", sortOrder: 50 },
  { slug: "asdc-l4", name: "ASDC Level 4", authority: "Automotive Skills Development Council", evDomainSlug: "after-sales", sortOrder: 51 },
  { slug: "asdc-ev-tech", name: "ASDC EV Technician", authority: "ASDC EV-Mobility programme", evDomainSlug: "after-sales", sortOrder: 52 },
  { slug: "saeindia-ev-eng", name: "SAEINDIA EV Engineer", authority: "SAEINDIA Mobility Engineering Society", evDomainSlug: "powertrain", sortOrder: 60 },
  { slug: "nsdc-bms", name: "NSDC BMS Specialist", authority: "National Skill Development Corporation", evDomainSlug: "battery-tech", sortOrder: 70 },
  { slug: "iec-61851", name: "IEC 61851 Compliant", authority: "IEC (charging-system interoperability)", evDomainSlug: "charging-infra", sortOrder: 80 },
  { slug: "iso-26262", name: "ISO 26262 Functional Safety", authority: "ISO (functional safety for road vehicles)", evDomainSlug: "software-iot", sortOrder: 90 },
  { slug: "autosar", name: "AUTOSAR Practitioner", authority: "AUTOSAR consortium", evDomainSlug: "software-iot", sortOrder: 100 },
];

// ─── #28 Skill Assessments ──────────────────────────────────────────
//
// Each assessment is a 10-question MCQ. Passing threshold defaults
// to 70%. Questions are written EV-specific (no generic engineering
// trivia). The shape is the same Assessment.questions JSON the
// existing runner consumes:
//   { questions: [{ id, text, options: [...], correctOption: 0..3 }] }
//
// IMPORTANT: keep correctOption indices accurate. The grader matches
// answer indices, not text — a re-ordering of options will silently
// invalidate everyone's prior attempts.

type MCQ = {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
};

type SkillAsmt = {
  slug: string;                              // permanent
  title: string;
  blurb: string;
  evDomainSlug: string;
  difficulty: SkillAssessmentDifficulty;
  estimatedMinutes: number;
  badgeThreshold: number;
  recruiterWeight: number;
  sortOrder: number;
  prepLinks?: { title: string; url: string }[];
  questions: MCQ[];
};

const ASSESSMENTS: SkillAsmt[] = [
  // ─── Battery Fundamentals ───────────────────────────────────────
  {
    slug: "battery-fundamentals",
    title: "Battery Fundamentals",
    blurb: "Li-ion chemistry basics, cell vs pack, energy density, common failure modes.",
    evDomainSlug: "battery-tech",
    difficulty: SkillAssessmentDifficulty.FOUNDATION,
    estimatedMinutes: 25,
    badgeThreshold: 70,
    recruiterWeight: 3,
    sortOrder: 10,
    prepLinks: [
      { title: "Li-ion 101 (DIYguru notes)", url: "https://diyguru.org/library/li-ion-101" },
      { title: "IEC 61960 cell-classification primer", url: "https://www.iec.ch/" },
    ],
    questions: [
      { id: "q1", text: "Which Li-ion cathode chemistry typically offers the highest cycle life at the cost of energy density?", options: ["NMC 811", "LFP (LiFePO4)", "NCA", "LCO"], correctOption: 1 },
      { id: "q2", text: "Typical nominal voltage of a single Li-ion cell (NMC) is closest to:", options: ["1.2 V", "2.1 V", "3.7 V", "4.8 V"], correctOption: 2 },
      { id: "q3", text: "Energy density (Wh/kg) of a current-generation NMC 811 cell is closest to:", options: ["80–100", "150–180", "240–280", "400–450"], correctOption: 2 },
      { id: "q4", text: "Thermal runaway in a Li-ion cell typically initiates around what surface temperature?", options: ["40–50 °C", "60–80 °C", "130–170 °C", "300–350 °C"], correctOption: 2 },
      { id: "q5", text: "C-rate of 2C on a 50 Ah cell corresponds to a charging current of:", options: ["25 A", "50 A", "100 A", "200 A"], correctOption: 2 },
      { id: "q6", text: "Which is NOT typically part of a Battery Management System (BMS)?", options: ["State-of-charge estimation", "Cell balancing", "Brake regen torque blending", "Thermal protection"], correctOption: 2 },
      { id: "q7", text: "A 14S2P pack made of 3.7 V / 5 Ah cells has nominal voltage and capacity:", options: ["14.8 V / 5 Ah", "51.8 V / 10 Ah", "7.4 V / 70 Ah", "51.8 V / 5 Ah"], correctOption: 1 },
      { id: "q8", text: "Coulombic efficiency above 99.5% over a charge-discharge cycle is most characteristic of:", options: ["Lead-acid", "Ni-MH", "Modern Li-ion", "Supercapacitor"], correctOption: 2 },
      { id: "q9", text: "Fast-charging stress on Li-ion cells primarily increases capacity fade because of:", options: ["Loss of cathode material", "Plating of lithium on the anode", "Electrolyte evaporation", "Separator melting"], correctOption: 1 },
      { id: "q10", text: "Which Indian standard defines safety requirements for portable Li-ion cells & batteries?", options: ["IS 16046", "IS 17017", "AIS-156", "IS 1293"], correctOption: 0 },
    ],
  },

  // ─── BMS Architecture ───────────────────────────────────────────
  {
    slug: "bms-architecture",
    title: "BMS Architecture",
    blurb: "Battery management — passive vs active balancing, CAN bus design, SOC algorithms.",
    evDomainSlug: "battery-tech",
    difficulty: SkillAssessmentDifficulty.INTERMEDIATE,
    estimatedMinutes: 30,
    badgeThreshold: 70,
    recruiterWeight: 5,
    sortOrder: 11,
    prepLinks: [
      { title: "Modern BMS design", url: "https://www.electronicspecifier.com/bms" },
    ],
    questions: [
      { id: "q1", text: "Passive cell balancing dissipates excess energy via:", options: ["DC-DC converter", "Bleed resistor", "Inductive coupling", "Flyback transformer"], correctOption: 1 },
      { id: "q2", text: "Active cell balancing's primary advantage over passive is:", options: ["Lower cost", "Simpler circuit", "Higher efficiency / less heat", "No microcontroller needed"], correctOption: 2 },
      { id: "q3", text: "A BMS reports state-of-charge using Coulomb counting + open-circuit-voltage. OCV alone is unreliable mid-discharge because:", options: ["The cell is too hot", "OCV vs SOC curve is flat in the mid range for some chemistries", "Coulomb counting is always 100% accurate", "OCV is only valid at 25 °C"], correctOption: 1 },
      { id: "q4", text: "The most common CAN bit rate used in EV BMS↔VCU links is:", options: ["125 kbps", "250 kbps", "500 kbps", "1 Mbps"], correctOption: 2 },
      { id: "q5", text: "AIS-156 mandates which type of pack-level fault response on thermal event?", options: ["Silent shutdown", "Audible alarm + thermal-runaway delay ≥5 min", "No requirement", "Automatic battery jettison"], correctOption: 1 },
      { id: "q6", text: "An impedance-tracking BMS estimates state-of-health by:", options: ["Counting full cycles", "Tracking internal resistance growth over time", "Measuring temperature peaks", "Logging maximum discharge current"], correctOption: 1 },
      { id: "q7", text: "Which fault is NOT typically a hardware safety interlock in a BMS?", options: ["Over-voltage on a single cell", "Under-temperature charging", "Excess motor torque request", "Pack-level over-current"], correctOption: 2 },
      { id: "q8", text: "ISO 26262 ASIL level typically targeted for a passenger-car BMS is:", options: ["QM", "ASIL A", "ASIL C or D", "ASIL X"], correctOption: 2 },
      { id: "q9", text: "Daisy-chained AFE ICs (LTC68xx / BQ7693) communicate with the BMS master via:", options: ["CAN", "isoSPI", "RS-485", "Wi-Fi"], correctOption: 1 },
      { id: "q10", text: "Pre-charge resistor protects the:", options: ["Cells from over-current", "Contactor contacts from arc damage at connection", "Inverter MOSFETs from latch-up", "BMS controller from EMI"], correctOption: 1 },
    ],
  },

  // ─── EV Powertrain Basics ──────────────────────────────────────
  {
    slug: "ev-powertrain-basics",
    title: "EV Powertrain Basics",
    blurb: "Motor types, inverter topology, gearbox tradeoffs, regen braking.",
    evDomainSlug: "powertrain",
    difficulty: SkillAssessmentDifficulty.FOUNDATION,
    estimatedMinutes: 25,
    badgeThreshold: 70,
    recruiterWeight: 3,
    sortOrder: 12,
    questions: [
      { id: "q1", text: "Which motor topology dominates passenger EVs today for its torque-density + efficiency at low speed?", options: ["DC brush", "PMSM (permanent-magnet synchronous)", "Induction (AC asynchronous)", "Switched reluctance"], correctOption: 1 },
      { id: "q2", text: "FOC (Field-Oriented Control) decomposes stator current into:", options: ["A and B phase", "Direct (d) and quadrature (q) components", "Real and reactive power", "Voltage and frequency"], correctOption: 1 },
      { id: "q3", text: "In a 3-phase inverter, the standard switching scheme that minimises common-mode voltage is:", options: ["Square-wave commutation", "Space Vector PWM (SVPWM)", "Single-pulse modulation", "Hysteresis bang-bang"], correctOption: 1 },
      { id: "q4", text: "Typical EV traction motor peak efficiency is closest to:", options: ["70%", "85%", "94%", "99%"], correctOption: 2 },
      { id: "q5", text: "Regen braking is limited at high SOC because:", options: ["The motor can't generate at high speed", "The pack can't accept current near 100% SOC", "Brake pedal feel is poor", "The inverter overheats"], correctOption: 1 },
      { id: "q6", text: "A 96 kW inverter on a 400 V DC bus draws roughly what peak current?", options: ["96 A", "240 A", "400 A", "600 A"], correctOption: 1 },
      { id: "q7", text: "Single-speed gearbox is feasible in EVs primarily because:", options: ["Motors have a wide constant-power speed range", "Torque is always low", "There's no friction in EV drivetrains", "The motor changes pole count"], correctOption: 0 },
      { id: "q8", text: "Power factor on an AC induction motor under field-weakening operation:", options: ["Stays at unity", "Drops with speed", "Inverts polarity", "Doesn't apply (it's DC at that point)"], correctOption: 1 },
      { id: "q9", text: "PMSM rotor position is typically sensed by:", options: ["Hall-effect sensors only", "Resolver or magnetic encoder", "Optical encoder on the wheel", "GPS"], correctOption: 1 },
      { id: "q10", text: "Killing the inverter switches under fault leaves a free-wheeling motor — what kind of current can the back-EMF push?", options: ["None — the inverter is off", "A short-circuit through the inverter body diodes", "Forward torque only", "Reverse polarity battery current"], correctOption: 1 },
    ],
  },

  // ─── Charging Infrastructure ───────────────────────────────────
  {
    slug: "charging-infrastructure",
    title: "Charging Infrastructure",
    blurb: "AC/DC standards, OCPP, CCS, BIS norms, V2G basics.",
    evDomainSlug: "charging-infra",
    difficulty: SkillAssessmentDifficulty.INTERMEDIATE,
    estimatedMinutes: 30,
    badgeThreshold: 70,
    recruiterWeight: 4,
    sortOrder: 13,
    questions: [
      { id: "q1", text: "CCS2 fast-charging combines AC and DC pins into a single inlet. The DC pins handle a peak power of:", options: ["22 kW", "50 kW", "150–350 kW", "1 MW"], correctOption: 2 },
      { id: "q2", text: "Bharat AC-001 standard supports up to which output power per port?", options: ["3.3 kW", "7.4 kW", "15 kW", "22 kW"], correctOption: 0 },
      { id: "q3", text: "OCPP 1.6J vs 2.0.1 — which adds plug-and-charge?", options: ["1.6J", "2.0.1", "Both", "Neither (PnC is ISO 15118)"], correctOption: 3 },
      { id: "q4", text: "Type 2 AC plug (IEC 62196-2) supports up to:", options: ["7.4 kW only", "22 kW (3-phase)", "50 kW DC", "350 kW DC"], correctOption: 1 },
      { id: "q5", text: "The CP (Control Pilot) line on a charging connector signals:", options: ["Vehicle make and model", "Maximum allowed current + state", "Battery temperature", "User payment status"], correctOption: 1 },
      { id: "q6", text: "An ISO 15118 vehicle authenticates to the charger using:", options: ["A QR code", "RFID only", "X.509 contract certificate", "Driver's licence number"], correctOption: 2 },
      { id: "q7", text: "Vehicle-to-Grid (V2G) requires bidirectional power flow primarily handled by:", options: ["The onboard charger only", "A bidirectional charger + DC fast-charger", "A standard AC outlet", "The motor inverter"], correctOption: 1 },
      { id: "q8", text: "BIS IS 17017 Part 2 covers:", options: ["AC charging connectors", "DC fast-charging connectors and station-side requirements", "Battery cell safety", "Two-wheeler swap stations"], correctOption: 1 },
      { id: "q9", text: "Round-trip efficiency of a DC fast-charge from grid to wheel is typically:", options: ["50–60%", "70–80%", "85–90%", "99%"], correctOption: 1 },
      { id: "q10", text: "OCPP messages are transported over:", options: ["MQTT only", "WebSocket (JSON or SOAP)", "Bluetooth Low Energy", "SMS"], correctOption: 1 },
    ],
  },

  // ─── EV Safety & Standards ─────────────────────────────────────
  {
    slug: "ev-safety-standards",
    title: "EV Safety & Standards",
    blurb: "AIS-156, ARAI test procedures, ISO 26262, functional safety in EVs.",
    evDomainSlug: "vehicle-engineering",
    difficulty: SkillAssessmentDifficulty.INTERMEDIATE,
    estimatedMinutes: 30,
    badgeThreshold: 70,
    recruiterWeight: 4,
    sortOrder: 14,
    questions: [
      { id: "q1", text: "AIS-156 (Amendment 2) phase 2 covers which key safety addition for L-category EVs?", options: ["Vehicle stability control", "Battery thermal propagation + warning before thermal event", "Pedestrian protection", "Cyber security only"], correctOption: 1 },
      { id: "q2", text: "ARAI nail-penetration test simulates which failure mode?", options: ["External short-circuit", "Internal short-circuit", "Over-charge", "Mechanical drop"], correctOption: 1 },
      { id: "q3", text: "ISO 26262 ASIL-D corresponds to which level of safety integrity?", options: ["Lowest", "Optional", "Highest", "Manufacturer-specific"], correctOption: 2 },
      { id: "q4", text: "Functional Safety Concept (FSC) is derived from:", options: ["Item Definition + HARA", "Software architecture only", "Hardware metrics", "Vehicle dynamics testing"], correctOption: 0 },
      { id: "q5", text: "Galvanic isolation between the HV pack and 12 V system is typically tested to a minimum of:", options: ["50 V", "100 V", "500 V", "Equal to pack voltage + safety margin (often 1 kV+)"], correctOption: 3 },
      { id: "q6", text: "EMC immunity testing for EVs falls under:", options: ["AIS-004", "AIS-038", "CISPR 12 / CISPR 25", "BIS 1293"], correctOption: 2 },
      { id: "q7", text: "An HV interlock loop ensures:", options: ["The charger is plugged in correctly", "Service technicians can't open the pack while voltage is present", "The battery is balanced", "The motor is engaged"], correctOption: 1 },
      { id: "q8", text: "ASIL decomposition allows:", options: ["Splitting one ASIL-D requirement into two independent ASIL-B requirements", "Skipping safety analysis on legacy code", "Reducing software testing", "Hiding hazards"], correctOption: 0 },
      { id: "q9", text: "Single-point fault metric (SPFM) is a metric for:", options: ["Software complexity", "Hardware random-fault coverage", "Manual labor", "Network bandwidth"], correctOption: 1 },
      { id: "q10", text: "Type approval of an EV pack in India is granted by:", options: ["BIS", "ARAI / ICAT / VRDE", "MoRTH directly", "NABL labs only"], correctOption: 1 },
    ],
  },
];

async function main() {
  console.log("Seeding Credential catalog...");
  for (const c of CREDENTIALS) {
    await db.credential.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, authority: c.authority, evDomainSlug: c.evDomainSlug, sortOrder: c.sortOrder },
    });
  }
  console.log(`  ${CREDENTIALS.length} credentials upserted`);

  console.log("Seeding Skill Assessments...");
  for (const a of ASSESSMENTS) {
    // Find or create the underlying Assessment row. We keep one
    // Assessment per skill (no jobId, isLibrary=true) and use its
    // questions JSON for the runner. SkillAssessmentMeta sidecars
    // the EV-specific metadata.
    const existingMeta = await db.skillAssessmentMeta.findUnique({
      where: { slug: a.slug },
      include: { assessment: true },
    });

    let assessmentId: string;
    if (existingMeta) {
      assessmentId = existingMeta.assessmentId;
      // Refresh questions / passingScore in case the seed was edited.
      await db.assessment.update({
        where: { id: assessmentId },
        data: {
          title: a.title,
          type: AssessmentType.MCQ,
          questions: { questions: a.questions },
          passingScore: a.badgeThreshold,
          durationMins: a.estimatedMinutes,
          isLibrary: true,
        },
      });
    } else {
      const created = await db.assessment.create({
        data: {
          title: a.title,
          type: AssessmentType.MCQ,
          questions: { questions: a.questions },
          passingScore: a.badgeThreshold,
          durationMins: a.estimatedMinutes,
          isLibrary: true,
        },
      });
      assessmentId = created.id;
    }

    await db.skillAssessmentMeta.upsert({
      where: { slug: a.slug },
      create: {
        slug: a.slug,
        assessmentId,
        evDomainSlug: a.evDomainSlug,
        difficulty: a.difficulty,
        blurb: a.blurb,
        estimatedMinutes: a.estimatedMinutes,
        prepLinks: a.prepLinks ?? undefined,
        badgeThreshold: a.badgeThreshold,
        recruiterWeight: a.recruiterWeight,
        sortOrder: a.sortOrder,
      },
      update: {
        evDomainSlug: a.evDomainSlug,
        difficulty: a.difficulty,
        blurb: a.blurb,
        estimatedMinutes: a.estimatedMinutes,
        prepLinks: a.prepLinks ?? undefined,
        badgeThreshold: a.badgeThreshold,
        recruiterWeight: a.recruiterWeight,
        sortOrder: a.sortOrder,
      },
    });
  }
  console.log(`  ${ASSESSMENTS.length} skill assessments upserted`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
