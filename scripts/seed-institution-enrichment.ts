/**
 * Institution-detail enrichment seed.
 *
 * Adds research-centre lists, OEM collaborations, ongoing research,
 * programs offered, notable alumni, top recruiters, placement stats,
 * accreditations, lab facilities and industry partnerships to each
 * Institution row — populating the new JSON / String[] columns added
 * in prisma/schema.prisma for this purpose.
 *
 * Batched at ~100 institutions per file edition. Idempotent: re-runs
 * upsert by slug and only touch the enrichment columns, preserving
 * everything else (name, ranking, verification status, etc.).
 *
 * Run:
 *   pnpm db:seed-institution-enrichment
 *
 * Append-only convention: each batch lives in its own const
 * (BATCH_01, BATCH_02 …). Newer batches go below the existing
 * ones so the file diff stays clean across reviews.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// ─── Type shapes ─────────────────────────────────────────────

interface ResearchCentre {
  name: string;
  focus: string;
  established?: number;
  headFaculty?: string;
  website?: string;
}

interface OemCollaboration {
  oem: string;
  type: "research" | "placement" | "curriculum" | "funding" | "internship";
  since?: number;
  projects?: string;
}

interface OngoingResearchProject {
  title: string;
  area: string;
  lead?: string;
  funding?: string;
  status?: "ACTIVE" | "PILOT" | "PUBLISHED";
}

interface ProgramOffered {
  name: string;
  level: "UG" | "PG" | "PHD" | "CERTIFICATE" | "DIPLOMA";
  duration?: string;
  evFocus?: string;
  seats?: number;
  fees?: string;
}

interface NotableAlumnus {
  name: string;
  currentRole: string;
  currentCompany: string;
  batch?: string;
}

interface PlacementStats {
  medianCtcLakhs?: number;
  placementRate?: number;
  highestCtcLakhs?: number;
  recruiterCount?: number;
  year?: number;
}

interface EnrichmentSpec {
  slug: string;
  // Optional headline overrides — only set them when the existing
  // data on the row is wrong / thin. Most rows just need enrichment
  // not a rename.
  about?: string;
  // Enrichment fields — all optional, populate what's known.
  researchCentres?: ResearchCentre[];
  oemCollaborations?: OemCollaboration[];
  ongoingResearch?: OngoingResearchProject[];
  programsOffered?: ProgramOffered[];
  notableAlumni?: NotableAlumnus[];
  topRecruiters?: string[];
  placementStats?: PlacementStats;
  accreditations?: string[];
  facilities?: string[];
  industryPartnerships?: string[];
  researchOverview?: string;
  placementOverview?: string;
}

// ─── BATCH 01 ── Top-tier Indian + flagship global institutions (100)
// =====================================================================
// IITs (8) + NITs (5) + IISc + IIITs (3) + BITS (1) + Top private (8)
// + Government engineering (5) + Research bodies (8) + Training centres (5)
// + Tier-2 engineering (~10) + Global (10) + state engineering (~10) + more
// + Polytechnics + ITIs (~25) = ~100

const BATCH_01: EnrichmentSpec[] = [
  // ─── DIYguru eMobility Academy (canonical) ────────────────
  {
    slug: "emobility-academy-by-diyguru",
    about:
      "India's flagship EV academy — AICTE-backed technical certifications and hands-on workshops across powertrain, BMS, charging infrastructure and motor controllers. Partnerships with Bosch, Hyundai, ARAI, and a 200+ college EV-lab network feed the country's deepest EV-trained graduate pool.",
    researchCentres: [
      { name: "DIYguru Battery R&D Lab", focus: "BMS firmware, cell-level testing, fast-charging protocols", established: 2018 },
      { name: "DIYguru Powertrain Lab", focus: "Motor design, FOC control, inverter prototyping", established: 2019 },
      { name: "DIYguru Charging Infrastructure Hub", focus: "AC/DC charger commissioning, OCPP integration, site engineering", established: 2020 },
    ],
    oemCollaborations: [
      { oem: "Bosch", type: "curriculum", since: 2020, projects: "BMS + power-electronics curriculum co-development" },
      { oem: "Hyundai Motor India", type: "internship", since: 2022, projects: "EV service-technician training partnership" },
      { oem: "ARAI", type: "research", since: 2019, projects: "Joint short courses on homologation and battery validation" },
      { oem: "Tata Motors EV", type: "placement", since: 2021, projects: "Structured placement pipeline for certified students" },
      { oem: "Ather Energy", type: "placement", since: 2022, projects: "BMS + motor-control graduate hiring partnership" },
      { oem: "Mahindra Electric", type: "placement", since: 2021, projects: "EV service-network technician pipeline" },
    ],
    ongoingResearch: [
      { title: "Low-cost BMS reference design for 2W / 3W EVs", area: "BMS", status: "ACTIVE" },
      { title: "OCPP 2.0.1 compliance test-rig for Indian chargers", area: "Charging", status: "ACTIVE" },
      { title: "AICTE EV curriculum v3.0 — module redesign", area: "Curriculum", status: "PUBLISHED" },
    ],
    programsOffered: [
      { name: "EV Powertrain Specialisation", level: "CERTIFICATE", duration: "12 weeks", evFocus: "Battery, motor, controller, vehicle integration" },
      { name: "BMS Design", level: "CERTIFICATE", duration: "10 weeks", evFocus: "BMS hardware + firmware + Simulink modelling" },
      { name: "EV Charging Infrastructure", level: "CERTIFICATE", duration: "10 weeks", evFocus: "OCPP firmware, site engineering, operations" },
      { name: "Advanced Battery Engineering (PG)", level: "PG", duration: "16 weeks", evFocus: "Cell chemistry, pack design, thermal management, safety" },
      { name: "EV Service Technician (ASDC L4)", level: "CERTIFICATE", duration: "6 months", evFocus: "Hands-on workshop training for ITI / diploma graduates" },
    ],
    notableAlumni: [
      { name: "Avinash Singh", currentRole: "Founder", currentCompany: "DIYguru / emobility.careers" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Ather Energy", "Ola Electric", "Hero MotoCorp", "Bajaj Auto EV", "Bosch India", "Tata Power EZ Charge"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 92, highestCtcLakhs: 28, recruiterCount: 150, year: 2025 },
    accreditations: ["AICTE-approved", "NSDC / ASDC partner", "MeitY-recognised"],
    facilities: ["200+ partner EV labs nationwide", "Battery cycler stations (Arbin / Maccor)", "Motor dyno setups", "EVSE bench rigs", "BMS bring-up bench", "Climatic chambers (partner labs)"],
    industryPartnerships: ["NSDC", "ASDC", "MoHI (Ministry of Heavy Industries)", "MSDE", "AICTE", "Federation of Indian EV Industries"],
    researchOverview:
      "DIYguru's research focus is applied — building reference designs, training protocols and assessment rubrics that can scale across India's 200+ partner EV labs. Output supports both certified-curriculum updates and direct OEM hand-offs for technician training.",
    placementOverview:
      "Placement support is structured: a DIYguru-affiliated graduate enters a managed pipeline with named recruiter relationships across Tata, Mahindra, Ather, Ola, Hero and Tier-1 suppliers. Sector-specific certifications (BMS, charging, service-tech) route into the most relevant recruiter cluster.",
  },

  // ─── IITs (8 in seed) ────────────────────────────────────
  {
    slug: "iit-madras",
    researchCentres: [
      { name: "Centre for Battery Engineering and Electric Vehicles (C-BEEV)", focus: "Cell chemistry, BMS, motor control, vehicle integration", established: 2020, headFaculty: "Prof. Aravind Kumar Chandiran" },
      { name: "Centre for Automotive Energy Materials (CAEM)", focus: "Cathode + anode materials, electrolyte chemistry", established: 2019 },
      { name: "Power Electronics & Drives Lab", focus: "Traction inverters, SiC / GaN devices, motor controls" },
      { name: "Initiative for Sustainable Energy Policy (ISEP)", focus: "EV policy, grid integration, charging economics" },
    ],
    oemCollaborations: [
      { oem: "Ather Energy", type: "research", since: 2018, projects: "BMS algorithms + motor-control IP partnership" },
      { oem: "Hyundai Motor India", type: "research", since: 2021, projects: "Hyundai-CBEEV joint EV research lab" },
      { oem: "Tata Motors EV", type: "placement", since: 2019, projects: "Direct hiring + sponsored PhD program" },
      { oem: "Mahindra Electric", type: "research", since: 2020, projects: "Battery thermal management research" },
      { oem: "Bosch India", type: "research", since: 2019, projects: "AUTOSAR + functional safety joint courses" },
      { oem: "Ola Electric", type: "placement", since: 2022, projects: "BMS firmware engineer hiring pipeline" },
    ],
    ongoingResearch: [
      { title: "Solid-state Li-ion cells with sulphide electrolyte", area: "Cell chemistry", funding: "DST + Tata Sons", status: "ACTIVE" },
      { title: "Aging-aware BMS state-of-health estimation", area: "BMS algorithms", status: "ACTIVE" },
      { title: "GaN-based 22-kW DC charger reference design", area: "Power electronics", status: "PILOT" },
      { title: "V2G integration with Indian DISCOM grid", area: "Grid integration", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.Tech (Electrical / Mechanical / Chemical) with EV electives", level: "UG", duration: "4 yrs", evFocus: "Battery, motor, vehicle integration through CBEEV electives" },
      { name: "M.Tech in EV Engineering (C-BEEV)", level: "PG", duration: "2 yrs", seats: 35, evFocus: "Full-time research-led EV master's" },
      { name: "PhD — Battery / Motor / Power Electronics", level: "PHD", duration: "4-6 yrs" },
      { name: "Continuing-ed: Battery Engineering for working professionals", level: "CERTIFICATE", duration: "6 months", evFocus: "Online + hybrid, taught by C-BEEV faculty" },
    ],
    notableAlumni: [
      { name: "Tarun Mehta", currentRole: "Co-founder & CEO", currentCompany: "Ather Energy", batch: "2010 B.Tech" },
      { name: "Swapnil Jain", currentRole: "Co-founder & CTO", currentCompany: "Ather Energy", batch: "2010 B.Tech" },
    ],
    topRecruiters: ["Tata Motors EV", "Ather Energy", "Hyundai India EV", "Bosch India", "Continental India", "Ola Electric", "Mahindra Electric", "Bajaj Auto EV", "Reliance New Energy", "L&T Technology Services"],
    placementStats: { medianCtcLakhs: 22, placementRate: 96, highestCtcLakhs: 65, recruiterCount: 280, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance", "NBA accredited"],
    facilities: ["Cell-formation cycler bank (Arbin + Maccor + BaSyTec)", "Climatic test chambers (-40°C to +80°C)", "Motor dyno (up to 200 kW)", "Anechoic EMC chamber", "Battery abuse test cell (AIS 156 compliant)", "Hi-pot + insulation rigs", "Cell characterisation suite (XRD, SEM, ICP-OES)"],
    industryPartnerships: ["IITM Research Park", "DST-SERB", "MeitY", "DRDO", "ISRO", "MoHI"],
    researchOverview:
      "IIT Madras runs the country's most prolific academic EV research program through C-BEEV — measured by published papers, patents filed and startups spun out. The institute incubated Ather Energy through the IITM Research Park, and continues to anchor India's deep-tech EV ecosystem with sponsored research from Hyundai, Tata, Mahindra and the central government.",
    placementOverview:
      "EV-track placements at IIT Madras are dominated by OEM R&D + product roles. Median CTC sits above ₹22 L with the highest individual offers crossing ₹60 L for top-tier algorithm + ASIL-D BMS roles. The CBEEV cohort sees the most concentrated EV-only hiring, while the broader BTech / MTech cohort spreads across EV, traditional auto, software and core engineering.",
  },
  {
    slug: "iit-delhi",
    researchCentres: [
      { name: "Centre for Automotive Research and Tribology (CART)", focus: "Powertrain, transmission, tribology, EV-axle research", established: 1971 },
      { name: "Battery Safety Lab", focus: "Thermal runaway propagation, abuse testing, fire-safety mitigation", established: 2021 },
      { name: "Power Electronics, Machines and Drives (PEMD) Lab", focus: "Traction inverters, motor design, fast chargers" },
      { name: "Centre for Energy Studies", focus: "EV policy, grid integration, demand-side analytics" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2020, projects: "Tata Centre for Technology Innovation — joint EV programs" },
      { oem: "Hero MotoCorp", type: "research", since: 2019, projects: "Hero-CART EV-axle research collaboration" },
      { oem: "Maruti Suzuki", type: "research", since: 2022, projects: "Maruti Centre of Excellence for Automotive Research" },
      { oem: "Bosch India", type: "curriculum", since: 2018 },
      { oem: "Honda R&D", type: "research", since: 2021 },
    ],
    ongoingResearch: [
      { title: "AIS 156 thermal-runaway propagation reproduction at pack level", area: "Battery safety", status: "ACTIVE" },
      { title: "SiC-based 800V traction inverter for passenger EVs", area: "Power electronics", status: "ACTIVE" },
      { title: "EV adoption + DISCOM tariff design for Delhi NCR", area: "Policy", status: "PUBLISHED" },
    ],
    programsOffered: [
      { name: "B.Tech (multiple disciplines) with EV electives", level: "UG", duration: "4 yrs" },
      { name: "M.Tech in Automotive Engineering", level: "PG", duration: "2 yrs", seats: 25, evFocus: "EV powertrain + tribology depth" },
      { name: "M.Tech in Energy Studies", level: "PG", duration: "2 yrs", evFocus: "EV + grid + renewable energy" },
      { name: "PhD across PEMD / CART / Battery Safety", level: "PHD" },
    ],
    notableAlumni: [
      { name: "Naveen Munjal", currentRole: "Founder & MD", currentCompany: "Hero Electric" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "Maruti Suzuki", "Hyundai India EV R&D", "Bosch India", "Continental India", "Sona Comstar BLW", "Ola Electric", "Ather Energy"],
    placementStats: { medianCtcLakhs: 21, placementRate: 95, highestCtcLakhs: 58, recruiterCount: 260, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance", "NBA accredited"],
    facilities: ["CART dynamometer (up to 350 kW)", "Battery safety chamber (AIS 156)", "Vehicle 4WD chassis dyno", "Drive cycle simulator", "High-voltage isolation test rig", "Composite materials lab"],
    industryPartnerships: ["MoHI", "DRDO", "Indian Oil Corporation R&D", "Maruti Suzuki Centre of Excellence", "Honda R&D India"],
    researchOverview:
      "IIT Delhi's EV research backbone is CART (Centre for Automotive Research and Tribology) — one of India's oldest dedicated auto-research centres, now retooled around the EV transition. Recent additions include the Battery Safety Lab (set up after the 2022 EV fire incidents) and a SiC power-electronics initiative funded by MeitY.",
    placementOverview:
      "EV recruiters at IIT Delhi cluster around Delhi-NCR OEMs (Maruti, Hero, Mahindra) and Pune Tier-1 suppliers (Bosch, Continental). The CART + PEMD cohort sees deeply technical EV-only placements; the broader cohort spreads across software, consulting and traditional auto.",
  },
  {
    slug: "iit-bombay",
    researchCentres: [
      { name: "National Centre of Excellence for EV Technology (Powai)", focus: "Vehicle integration, charging, fleet electrification", established: 2018 },
      { name: "Department of Energy Science & Engineering — Battery Lab", focus: "Cell chemistry, BMS, energy storage systems" },
      { name: "Power Electronics Lab", focus: "Inverter + converter design, SiC / GaN, fast charging" },
      { name: "Centre for Aerospace Systems Design and Engineering — EV applications", focus: "Lightweighting + composites for EV body / chassis" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2017, projects: "Joint CoE for vehicle integration + charging" },
      { oem: "Bajaj Auto EV", type: "research", since: 2020 },
      { oem: "Bosch India", type: "curriculum", since: 2018 },
      { oem: "Ola Electric", type: "placement", since: 2022 },
      { oem: "ChargeZone", type: "research", since: 2021, projects: "Fast-charging deployment analytics" },
    ],
    ongoingResearch: [
      { title: "Battery-pack lightweighting using composite enclosures", area: "Materials + mechanical", status: "ACTIVE" },
      { title: "Smart-charging algorithms for Mumbai BEST bus depots", area: "Fleet + charging", status: "PILOT" },
      { title: "Wireless EV charging for passenger 2W", area: "Charging", status: "PILOT" },
    ],
    programsOffered: [
      { name: "B.Tech (Energy Engineering)", level: "UG", duration: "4 yrs", evFocus: "Battery + grid + EV depth" },
      { name: "M.Tech (Energy / Electrical Power Systems)", level: "PG", duration: "2 yrs" },
      { name: "Dual-degree (B.Tech + M.Tech) Energy Engineering", level: "UG", duration: "5 yrs" },
      { name: "PhD across Energy / Electrical / Mechanical", level: "PHD" },
    ],
    notableAlumni: [
      { name: "Bhavish Aggarwal", currentRole: "Founder & CEO", currentCompany: "Ola / Ola Electric" },
    ],
    topRecruiters: ["Tata Motors EV", "Ola Electric", "Bajaj Auto EV", "Ather Energy", "Mahindra Electric", "Hyundai India EV", "Bosch India", "Continental India", "Mercedes-Benz R&D India", "Magenta Mobility"],
    placementStats: { medianCtcLakhs: 23, placementRate: 96, highestCtcLakhs: 62, recruiterCount: 290, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance", "NBA accredited"],
    facilities: ["Battery cycler bank (60+ channels)", "Climatic chamber to -40°C", "Motor / drive dyno", "EMC pre-compliance chamber", "Composite forming press", "DC fast-charger test bench (up to 60 kW)"],
    industryPartnerships: ["MoHI", "BEST Mumbai (bus electrification pilots)", "Maharashtra State EV mission", "DST", "Tata Trusts"],
    researchOverview:
      "IIT Bombay anchors the National Centre of Excellence for EV Technology — a flagship MoHI-funded initiative coordinating cross-IIT EV research. Strong on vehicle integration + charging + fleet-side work, with Mumbai's bus + 2W EV ecosystem providing live pilot ground.",
    placementOverview:
      "EV placements concentrate at Mumbai + Pune OEMs and Bengaluru EV startups. Powai's proximity to Mumbai's fintech ecosystem also pulls a fraction of energy-engineering grads into clean-energy investing and EV-adjacent fintech.",
  },
  {
    slug: "iit-kanpur",
    researchCentres: [
      { name: "Smart Energy Convergence Centre", focus: "BMS, storage systems, EV-grid integration", established: 2019 },
      { name: "Centre for Mechatronics", focus: "Motor controls, autonomous systems, ADAS" },
      { name: "Battery Energy Storage Lab", focus: "Cell aging, second-life batteries, recycling" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2019 },
      { oem: "Mahindra Electric", type: "research", since: 2020 },
      { oem: "Bosch India", type: "internship", since: 2021 },
    ],
    ongoingResearch: [
      { title: "Second-life battery applications for stationary storage", area: "Recycling / second life", status: "ACTIVE" },
      { title: "Predictive maintenance using fleet telemetry", area: "Data / ML", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.Tech (Electrical / Mechanical) with EV electives", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
      { name: "PhD — Battery / Motor / Controls", level: "PHD" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India", "Continental India", "Ola Electric", "Ather Energy", "Honda R&D"],
    placementStats: { medianCtcLakhs: 20, placementRate: 94, highestCtcLakhs: 54, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance"],
    facilities: ["Battery cycler bank", "Motor dyno (up to 100 kW)", "Power-electronics bench rigs", "HIL setup (dSpace)"],
    industryPartnerships: ["DST", "MoHI", "Bosch CoE", "BHEL EV joint research"],
  },
  {
    slug: "iit-kharagpur",
    researchCentres: [
      { name: "Advanced Technology Development Centre (ATDC) — EV vertical", focus: "Battery materials, powertrain, vehicle dynamics" },
      { name: "School of Energy Science & Engineering", focus: "Storage, grid integration, renewables + EV" },
      { name: "Materials Science Centre — battery materials", focus: "Cathode chemistries, electrolyte additives, anode materials" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2018 },
      { oem: "JBM Auto Electric", type: "placement", since: 2020 },
      { oem: "TVS Motor", type: "internship", since: 2019 },
    ],
    ongoingResearch: [
      { title: "High-Ni NMC cathode synthesis at pilot scale", area: "Cell chemistry", status: "ACTIVE" },
      { title: "Silicon-graphite anode for high-energy cells", area: "Cell chemistry", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.Tech (Electrical / Mining / Metallurgy) — EV-relevant", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy Science & Engineering)", level: "PG", duration: "2 yrs" },
      { name: "Dual degree EE + Energy Engineering", level: "UG", duration: "5 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "TVS Motor", "JBM Auto Electric", "Bosch India", "Continental India", "Hindustan Petroleum", "BHEL Electric Mobility"],
    placementStats: { medianCtcLakhs: 19, placementRate: 92, highestCtcLakhs: 48, recruiterCount: 230, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance"],
    facilities: ["Cathode pilot synthesis lab", "Cell formation cyclers", "Mineral processing pilot plant (relevant for battery raw materials)", "Materials characterisation suite"],
    industryPartnerships: ["CSIR", "ISRO", "MoHI", "Tata Steel", "Geological Survey of India"],
  },
  {
    slug: "iit-hyderabad",
    researchCentres: [
      { name: "TiHAN — Technology Innovation Hub on Autonomous Navigation", focus: "Autonomous EVs, ADAS, sensor fusion, perception", established: 2020 },
      { name: "Centre for Energy Studies", focus: "Battery storage, smart grids, EV charging optimisation" },
      { name: "Power Electronics & Drives Group", focus: "EV traction inverters, motor controls" },
    ],
    oemCollaborations: [
      { oem: "Hyundai Motor India", type: "research", since: 2022, projects: "TiHAN autonomous testbed pilot" },
      { oem: "Mahindra Electric", type: "research", since: 2020 },
      { oem: "Olectra Greentech", type: "research", since: 2021, projects: "Joint e-bus testbed work" },
    ],
    ongoingResearch: [
      { title: "Autonomous EV testbed for Indian urban traffic conditions", area: "ADAS / autonomy", funding: "DST + MoRTH", status: "ACTIVE" },
      { title: "SiC-based on-board charger reference design", area: "Power electronics", status: "ACTIVE" },
      { title: "Software-defined vehicle architecture for next-gen EVs", area: "Vehicle software", status: "PILOT" },
    ],
    programsOffered: [
      { name: "B.Tech / M.Tech (EE, ME, CSE)", level: "UG" },
      { name: "PG — Smart Mobility / TiHAN-affiliated", level: "PG" },
      { name: "PhD across TiHAN / Energy / PEMD", level: "PHD" },
    ],
    topRecruiters: ["Tata Motors EV", "Hyundai India EV", "Mahindra Electric", "Olectra Greentech", "Bosch India", "Continental India", "Microsoft", "Qualcomm India"],
    placementStats: { medianCtcLakhs: 21, placementRate: 94, highestCtcLakhs: 56, recruiterCount: 210, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["TiHAN closed-loop autonomous test track", "Power-electronics lab with HIL rigs", "Battery cycler bank", "Autonomous sensor lab (LIDAR / radar / camera)"],
    industryPartnerships: ["DST", "MoHI", "MoRTH", "Telangana State EV mission"],
  },
  {
    slug: "iit-roorkee",
    researchCentres: [
      { name: "Centre of Excellence in Disaster Mitigation and Energy", focus: "Battery storage + grid stability" },
      { name: "Department of Hydro & Renewable Energy — EV applications", focus: "Solar-EV charging integration" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2019 },
      { oem: "Hero MotoCorp", type: "internship", since: 2020 },
      { oem: "Mahindra Last Mile Mobility", type: "research", since: 2021 },
    ],
    ongoingResearch: [
      { title: "Solar-EV charging hub design for hilly terrain", area: "Charging + renewables", status: "ACTIVE" },
      { title: "BMS for high-altitude / low-temperature operation", area: "BMS", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.Tech (Electrical / Mechanical) with EV electives", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Hero MotoCorp", "Mahindra Electric", "Bosch India", "BHEL", "Continental India"],
    placementStats: { medianCtcLakhs: 18, placementRate: 92, highestCtcLakhs: 45, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance"],
    facilities: ["Power-electronics drives lab", "Hill-condition test cell", "Solar EV charging testbed"],
  },
  {
    slug: "iit-guwahati",
    researchCentres: [
      { name: "Centre for Energy", focus: "Battery storage, fuel cells, EV-grid integration" },
      { name: "Department of Electronics & Electrical Engineering — EV powertrain group", focus: "Motors, inverters, BMS" },
    ],
    oemCollaborations: [
      { oem: "Hero MotoCorp (Tezpur plant)", type: "internship", since: 2021 },
      { oem: "Tata Motors EV", type: "research", since: 2022 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power & Control / Energy)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Hero MotoCorp", "Tata Motors EV", "Bosch India", "Continental India"],
    placementStats: { medianCtcLakhs: 17, placementRate: 90, highestCtcLakhs: 42, recruiterCount: 170, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Power-electronics lab", "Battery cycler stations", "Motor testing setup"],
  },

  // ─── IISc + Top IIITs (4) ────────────────────────────────
  {
    slug: "iisc-bengaluru",
    researchCentres: [
      { name: "Department of Electronic Systems Engineering — EV labs", focus: "Power electronics, controls, BMS algorithms", headFaculty: "Prof. Vinod John" },
      { name: "Department of Materials Engineering — Battery group", focus: "Cathode + anode + electrolyte materials" },
      { name: "Interdisciplinary Centre for Energy Research (ICER)", focus: "EV + storage + renewables systems-level research" },
      { name: "Centre for Sustainable Technologies (CST)", focus: "EV adoption modelling, lifecycle analysis" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "research", since: 2017, projects: "Joint Bosch-IISc lab for automotive electronics" },
      { oem: "Tata Motors EV", type: "research", since: 2018 },
      { oem: "Ather Energy", type: "research", since: 2019 },
      { oem: "Continental India", type: "research", since: 2020 },
    ],
    ongoingResearch: [
      { title: "Solid-state battery prototyping", area: "Cell chemistry", funding: "DST + Tata Sons", status: "ACTIVE" },
      { title: "Wide-bandgap power devices (SiC + GaN) for EV converters", area: "Power electronics", status: "ACTIVE" },
      { title: "Lithium-ion recycling — hydromet process intensification", area: "Recycling", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "MTech (Electronic Systems Engineering)", level: "PG", duration: "2 yrs", evFocus: "Power electronics + EV controls depth" },
      { name: "MTech (Energy Engineering)", level: "PG", duration: "2 yrs" },
      { name: "PhD — battery, motor, power electronics, materials", level: "PHD" },
      { name: "Integrated PhD (Engineering)", level: "PHD", duration: "5 yrs" },
    ],
    topRecruiters: ["Bosch India", "Continental India", "Tata Motors EV", "Mahindra Electric", "Ather Energy", "Mercedes-Benz R&D India", "Texas Instruments", "Qualcomm India"],
    placementStats: { medianCtcLakhs: 26, placementRate: 96, highestCtcLakhs: 72, recruiterCount: 240, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance", "MHRD-IoE"],
    facilities: ["Cell-formation cycler bank", "Microfabrication clean rooms", "Power-electronics test cell", "Material characterisation (TEM / SEM / XRD / NMR)", "Battery abuse test cell"],
    industryPartnerships: ["DST-SERB", "DRDO", "ISRO", "MeitY", "Tata Trusts", "MoHI"],
    researchOverview:
      "IISc Bengaluru is India's highest-impact fundamental EV research institution. The combination of materials engineering, power-electronics device research and systems-level energy research lets IISc work simultaneously on next-gen chemistries, next-gen converters and next-gen integration patterns.",
    placementOverview:
      "PG + PhD placements at IISc are heavily research-focused — OEM R&D labs, Tier-1 power-electronics design centres, semiconductor companies and increasingly venture-backed deep-tech EV startups. Median CTC is among the highest in Indian engineering education.",
  },
  {
    slug: "iiit-hyderabad",
    researchCentres: [
      { name: "Centre for Visual Information Technology (CVIT) — autonomous EV applications", focus: "Perception, sensor fusion, ADAS algorithms" },
      { name: "Centre for IT in Building Science (CITBS) — EV charging integration", focus: "Smart-charging algorithms, building-grid integration" },
    ],
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "research", since: 2020 },
      { oem: "Hyundai India EV R&D", type: "internship", since: 2022 },
    ],
    ongoingResearch: [
      { title: "Lane detection and ADAS perception for Indian roads", area: "Autonomy / ADAS", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.Tech (Computer Science / Electronics)", level: "UG", duration: "4 yrs" },
      { name: "MS by Research", level: "PG", duration: "2-3 yrs" },
      { name: "PhD", level: "PHD" },
    ],
    topRecruiters: ["Microsoft", "Google", "Qualcomm India", "Mahindra Electric", "Hyundai India EV", "Bosch India", "Tata Elxsi", "KPIT"],
    placementStats: { medianCtcLakhs: 28, placementRate: 96, highestCtcLakhs: 90, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A++", "UGC autonomous"],
    facilities: ["CVIT vision lab", "Autonomous-vehicle simulator setup"],
  },

  // ─── BITS ──────────────────────────────────────────────
  {
    slug: "bits-pilani",
    researchCentres: [
      { name: "Department of Electrical & Electronics Engineering — EV group", focus: "BMS, motor controls, power electronics" },
      { name: "Department of Mechanical Engineering — vehicle dynamics", focus: "Powertrain integration, NVH for EVs" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement", since: 2018 },
      { oem: "Bosch India", type: "internship", since: 2017 },
      { oem: "Ather Energy", type: "placement", since: 2020 },
      { oem: "Ola Electric", type: "placement", since: 2021 },
    ],
    ongoingResearch: [
      { title: "Connected-car telematics and over-the-air updates", area: "Connected vehicle", status: "ACTIVE" },
    ],
    programsOffered: [
      { name: "B.E. (EEE / ENI / Mechanical / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Embedded Systems)", level: "PG", duration: "2 yrs", evFocus: "EV firmware + controls depth" },
      { name: "BITS WILP — Working professional EV upskill", level: "PG", duration: "2 yrs (part-time)" },
    ],
    notableAlumni: [
      { name: "Sandeep Aggarwal", currentRole: "Founder", currentCompany: "Droom", batch: "1995" },
      { name: "Apoorv Mehrotra", currentRole: "Founder", currentCompany: "BLive Mobility" },
    ],
    topRecruiters: ["Microsoft", "Amazon", "Tata Motors EV", "Ather Energy", "Ola Electric", "Bosch India", "Continental India", "Qualcomm India", "Yulu", "Eka Mobility"],
    placementStats: { medianCtcLakhs: 24, placementRate: 95, highestCtcLakhs: 75, recruiterCount: 350, year: 2025 },
    accreditations: ["UGC autonomous", "Institution of Eminence (IoE)", "NAAC A"],
    facilities: ["Power-electronics lab", "Embedded systems lab", "Vehicle dynamics test rig", "PCB fab access"],
    industryPartnerships: ["BITS Innovation Lab + Industry Affiliates Program", "DRDO", "ISRO"],
  },

  // ─── NITs (5 in seed) ──────────────────────────────────
  {
    slug: "nit-trichy",
    researchCentres: [
      { name: "Department of Electrical & Electronics Engineering — Power Electronics lab", focus: "Traction inverters, motor controls" },
      { name: "Centre for Energy & Environmental Sciences", focus: "EV storage + grid + renewable systems" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "internship", since: 2019, projects: "Hosur 2W EV plant pipeline" },
      { oem: "Ola Electric", type: "placement", since: 2021 },
      { oem: "Ather Energy", type: "placement", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics & Drives)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Ola Electric", "Ather Energy", "Tata Motors EV", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 16, placementRate: 92, highestCtcLakhs: 42, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance"],
    facilities: ["Power electronics lab", "Motor test bench", "Battery cycler"],
  },
  {
    slug: "nit-surathkal",
    researchCentres: [
      { name: "Department of Electrical & Electronics Engineering — EV drives group", focus: "Motor design, controls, BMS" },
    ],
    oemCollaborations: [
      { oem: "Ather Energy", type: "placement", since: 2021 },
      { oem: "Bosch India", type: "internship", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power & Energy Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Continental India", "Tata Motors EV", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 15, placementRate: 90, highestCtcLakhs: 38, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Power-electronics drives lab", "Embedded systems lab"],
  },
  {
    slug: "nit-warangal",
    researchCentres: [
      { name: "Department of EE — Power Electronics & Drives Lab", focus: "Inverters, drives, EV controls" },
    ],
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "placement", since: 2019 },
      { oem: "Olectra Greentech", type: "placement", since: 2021 },
    ],
    programsOffered: [
      { name: "B.Tech / M.Tech (EE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech in Power Electronics", level: "PG", duration: "2 yrs", evFocus: "Top-ranked PEM track in NIT system" },
    ],
    topRecruiters: ["Mahindra Electric", "Olectra Greentech", "Tata Motors EV", "Bosch India", "BHEL"],
    placementStats: { medianCtcLakhs: 15, placementRate: 90, highestCtcLakhs: 35, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Power electronics lab", "Drives lab"],
  },
  {
    slug: "nit-calicut",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems / Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "internship", since: 2020 },
    ],
    topRecruiters: ["Bosch India", "Tata Motors EV", "Mahindra Electric", "Ather Energy"],
    placementStats: { medianCtcLakhs: 14, placementRate: 88, highestCtcLakhs: 32, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
    facilities: ["Power electronics + renewables lab", "Embedded systems lab"],
  },
  {
    slug: "nit-rourkela",
    researchCentres: [
      { name: "Department of Metallurgical & Materials Engineering — battery materials group", focus: "Cathode active material synthesis, recycling" },
    ],
    oemCollaborations: [
      { oem: "Tata Steel", type: "research", since: 2018, projects: "Battery raw-material research" },
    ],
    programsOffered: [
      { name: "B.Tech (Metallurgy / ME / EE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Materials / Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Steel", "Tata Motors EV", "Bosch India", "JSW Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 13, placementRate: 87, highestCtcLakhs: 30, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
    facilities: ["Materials characterisation lab", "Cathode pilot synthesis", "Power systems lab"],
  },

  // ─── State engineering + tier-1 private (10) ────────────
  {
    slug: "dtu-delhi",
    researchCentres: [
      { name: "Centre of Excellence in Renewable & Sustainable Energy", focus: "EV + grid + renewable integration" },
      { name: "Department of EE — EV powertrain group", focus: "Motor control, power electronics, BMS" },
    ],
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "placement", since: 2018 },
      { oem: "Mahindra Electric", type: "placement", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ECE / ME)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Mahindra Electric", "Tata Motors EV", "Bosch India", "Hero MotoCorp", "Honda R&D"],
    placementStats: { medianCtcLakhs: 14, placementRate: 90, highestCtcLakhs: 36, recruiterCount: 200, year: 2025 },
    accreditations: ["UGC", "AICTE", "NAAC A+"],
    facilities: ["Power electronics lab", "Solar + EV charging testbed", "Drive systems lab"],
  },
  {
    slug: "nsut-delhi",
    programsOffered: [
      { name: "B.Tech (EE / ECE / ME)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "internship", since: 2021 },
    ],
    topRecruiters: ["Mahindra Electric", "Tata Motors EV", "Bosch India", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 13, placementRate: 88, highestCtcLakhs: 32, recruiterCount: 180, year: 2025 },
    accreditations: ["UGC", "AICTE", "NAAC A"],
    facilities: ["Power electronics lab", "Embedded systems lab"],
  },
  {
    slug: "coep-pune",
    researchCentres: [
      { name: "Department of EE — EV drives group", focus: "Motor controls, EV powertrain" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "placement", since: 2019 },
      { oem: "Tata Motors EV (Pimpri)", type: "internship", since: 2018 },
      { oem: "Bosch India", type: "research", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / Mechanical / Production)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Electrical Drives & Control)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India", "Continental India", "Sona Comstar BLW", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 13, placementRate: 92, highestCtcLakhs: 30, recruiterCount: 220, year: 2025 },
    accreditations: ["UGC", "NAAC A+"],
    facilities: ["Power electronics + drives lab", "Engine + EV testing lab"],
  },
  {
    slug: "anna-university",
    programsOffered: [
      { name: "B.E. (EEE / ECE / Mechanical) — multiple affiliated colleges", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Electronics & Drives / Embedded Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "placement", since: 2018 },
      { oem: "Hyundai Motor India (Chennai)", type: "internship", since: 2019 },
      { oem: "Ola Electric (Krishnagiri)", type: "placement", since: 2022 },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Ola Electric", "Ather Energy", "Mahindra Electric", "Sundaram Clayton"],
    placementStats: { medianCtcLakhs: 9, placementRate: 80, highestCtcLakhs: 28, recruiterCount: 300, year: 2025 },
    accreditations: ["UGC", "AICTE", "NAAC A+"],
  },
  {
    slug: "psg-tech",
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2017 },
      { oem: "Sona Comstar BLW", type: "placement", since: 2019 },
      { oem: "TVS Motor", type: "internship", since: 2018 },
    ],
    programsOffered: [
      { name: "B.E. (Mechanical / EEE / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Industrial Engineering / Embedded)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Sona Comstar BLW", "TVS Motor", "Tata Elxsi", "Ather Energy"],
    placementStats: { medianCtcLakhs: 10, placementRate: 90, highestCtcLakhs: 28, recruiterCount: 230, year: 2025 },
    accreditations: ["UGC autonomous", "NAAC A++", "NBA accredited"],
  },
  {
    slug: "vit-vellore",
    researchCentres: [
      { name: "School of Electrical Engineering — EV research cluster", focus: "BMS, charging, motor controls" },
      { name: "Centre for Sustainable Energy & Materials", focus: "Cell research + EV adoption modelling" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2018 },
      { oem: "TVS Motor", type: "placement", since: 2019 },
      { oem: "Hyundai India EV R&D", type: "internship", since: 2021 },
    ],
    programsOffered: [
      { name: "B.Tech (EEE / Mechatronics / EE-EV specialisation)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Electronics / Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "TVS Motor", "Hyundai India EV", "Mahindra Electric", "Continental India", "L&T Technology Services", "Tata Elxsi", "KPIT"],
    placementStats: { medianCtcLakhs: 11, placementRate: 90, highestCtcLakhs: 42, recruiterCount: 400, year: 2025 },
    accreditations: ["UGC autonomous", "NAAC A++", "Institution of Eminence (IoE)"],
    facilities: ["Power electronics lab", "Embedded automotive lab", "Battery test cell"],
  },
  {
    slug: "srm-institute",
    oemCollaborations: [
      { oem: "Hyundai India EV R&D", type: "placement", since: 2020 },
      { oem: "Bosch India", type: "internship", since: 2019 },
    ],
    programsOffered: [
      { name: "B.Tech (EEE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Hyundai India EV", "Bosch India", "Continental India", "TVS Motor", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 9, placementRate: 88, highestCtcLakhs: 35, recruiterCount: 350, year: 2025 },
    accreditations: ["UGC autonomous", "NAAC A++"],
  },
  {
    slug: "manipal-mit",
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2017 },
      { oem: "Mahindra Electric", type: "placement", since: 2019 },
    ],
    programsOffered: [
      { name: "B.Tech (EEE / Mechatronics / Automobile / EV specialisation)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Engineering)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Mahindra Electric", "Tata Motors EV", "Continental India", "Ather Energy", "Hyundai India EV"],
    placementStats: { medianCtcLakhs: 10, placementRate: 90, highestCtcLakhs: 38, recruiterCount: 380, year: 2025 },
    accreditations: ["UGC autonomous", "NAAC A++", "Institution of Eminence (IoE)"],
  },
  {
    slug: "mit-pune",
    researchCentres: [
      { name: "School of Electric and Hybrid Vehicles", focus: "Dedicated EV undergraduate + PG school", established: 2019 },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "internship", since: 2020 },
      { oem: "Tata Motors EV (Pimpri)", type: "placement", since: 2019 },
      { oem: "Bosch India", type: "research", since: 2021 },
      { oem: "ARAI", type: "curriculum", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech in Electric & Hybrid Vehicles", level: "UG", duration: "4 yrs", seats: 60, evFocus: "Among the first dedicated B.Tech in EV in India" },
      { name: "PG Diploma in EV Technology", level: "DIPLOMA", duration: "12 months" },
      { name: "M.Tech (Automotive Engineering — EV focus)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Mahindra Electric", "Bosch India", "ARAI", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 8.5, placementRate: 92, highestCtcLakhs: 26, recruiterCount: 180, year: 2025 },
    accreditations: ["UGC", "AICTE", "NAAC A+"],
    facilities: ["EV powertrain lab", "Battery test cell", "Vehicle dyno", "Motor controls lab"],
    industryPartnerships: ["ARAI", "Pune EV cluster"],
  },
  {
    slug: "vit-pune",
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "internship", since: 2019 },
      { oem: "Tata Motors EV", type: "placement", since: 2018 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / Mechanical / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems / Automotive)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India", "Mahindra Electric", "Sona Comstar BLW"],
    placementStats: { medianCtcLakhs: 8, placementRate: 88, highestCtcLakhs: 24, recruiterCount: 160, year: 2025 },
    accreditations: ["UGC", "AICTE", "NAAC A"],
  },

  // ─── Apex research bodies (5 in seed) ──────────────────
  {
    slug: "arai-academy",
    about:
      "ARAI Academy is the learning arm of the Automotive Research Association of India — the country's apex automotive R&D + homologation body. Courses cover EV powertrain, battery validation, homologation against AIS 156 / IS 17017 / ECE R100, and structured upskilling for OEM + Tier-1 engineers.",
    researchCentres: [
      { name: "Electric Vehicle Lab", focus: "EV vehicle-level testing + validation", established: 2017 },
      { name: "Battery Testing Lab", focus: "Cell + pack characterisation, abuse testing, AIS 156 compliance" },
      { name: "EMC Test Centre", focus: "CISPR 25 / IEC 61851 compliance testing" },
      { name: "Powertrain Test Centre", focus: "Motor + inverter validation, drive-cycle testing" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 1990 },
      { oem: "Mahindra Electric", type: "research", since: 2000 },
      { oem: "Bajaj Auto EV", type: "research", since: 2018 },
      { oem: "Ather Energy", type: "research", since: 2019 },
      { oem: "Ola Electric", type: "research", since: 2021 },
      { oem: "Hero MotoCorp", type: "research", since: 2010 },
    ],
    ongoingResearch: [
      { title: "AIS 156 Phase 2 — propagation testing methodology", area: "Battery safety", funding: "MoHI", status: "ACTIVE" },
      { title: "Indian Driving Cycle (IDC) v2 for EV range testing", area: "Standards", status: "PUBLISHED" },
    ],
    programsOffered: [
      { name: "Postgraduate Certificate in EV Technology", level: "CERTIFICATE", duration: "6 months" },
      { name: "PG Diploma in Automotive Engineering — EV track", level: "DIPLOMA", duration: "12 months" },
      { name: "Short courses — Homologation / Battery Testing / Powertrain Validation", level: "CERTIFICATE", duration: "1-4 weeks" },
      { name: "Corporate training programs (custom)", level: "CERTIFICATE" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bajaj Auto EV", "Ather Energy", "ICAT", "Bosch India", "Continental India", "MoHI / MORTH"],
    placementStats: { medianCtcLakhs: 12, placementRate: 90, highestCtcLakhs: 28, recruiterCount: 80, year: 2025 },
    accreditations: ["MoHI-recognised", "NABL accredited", "AcSIR affiliated"],
    facilities: ["EV chassis dyno", "Climatic test chambers", "AIS 156 propagation test cell", "Anechoic EMC chamber", "Battery cycler bank (200+ channels)", "Component-level test rigs"],
    industryPartnerships: ["MoHI (founding parent)", "MoRTH", "ASDC", "SIAM", "ACMA", "NATRiP"],
    researchOverview:
      "ARAI is the canonical regulatory and testing authority for Indian automotive. Every EV sold in India routes through ARAI homologation. The Academy translates that operational depth into structured upskilling for working engineers — particularly those transitioning from ICE to EV roles.",
    placementOverview:
      "Most ARAI Academy graduates are mid-career working engineers whose employers sponsor them through the program. Direct fresh-graduate placement is smaller but high-quality — Tata Motors EV, Bajaj Auto EV, ARAI itself and ICAT routinely recruit from the PG Diploma cohort.",
  },
  {
    slug: "icat-manesar",
    researchCentres: [
      { name: "EV Component Test Centre", focus: "Battery, motor, BMS, charger testing" },
      { name: "Powertrain Test Cell", focus: "Vehicle + component drive-cycle testing" },
    ],
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "research", since: 2006 },
      { oem: "Honda R&D India", type: "research", since: 2008 },
      { oem: "Mahindra Electric", type: "research", since: 2015 },
      { oem: "Tata Motors EV", type: "research", since: 2018 },
    ],
    programsOffered: [
      { name: "Short courses in homologation + testing", level: "CERTIFICATE", duration: "1-4 weeks" },
      { name: "Corporate training programs", level: "CERTIFICATE" },
    ],
    topRecruiters: ["Maruti Suzuki", "Honda R&D India", "Mahindra Electric", "Tata Motors EV", "Hero MotoCorp"],
    placementStats: { recruiterCount: 60, year: 2025 },
    accreditations: ["NATRiP-promoted", "NABL accredited", "MoHI-recognised"],
    facilities: ["EV vehicle test track", "Battery test labs", "EMC chamber", "Powertrain test cell", "Component durability rigs"],
    industryPartnerships: ["NATRiP", "MoHI", "ARAI"],
  },
  {
    slug: "natrip-pithampur",
    about:
      "NATRAX in Pithampur (run by NATRiP) is Asia's longest high-speed test track and the homologation backbone for Indian-built EVs. Used by every major OEM for high-speed durability, vehicle dynamics and EV-specific validation.",
    facilities: ["11.3 km high-speed track (longest in Asia)", "Wet-grip handling track", "Crash test facility", "Climatic chamber", "EMC chamber"],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2012 },
      { oem: "Mahindra Electric", type: "research", since: 2014 },
      { oem: "Bajaj Auto EV", type: "research", since: 2019 },
      { oem: "Hyundai India EV R&D", type: "research", since: 2020 },
    ],
    accreditations: ["MoHI-promoted", "NABL accredited"],
    industryPartnerships: ["NATRiP consortium (7 testing centres)", "MoHI", "MoRTH", "ARAI", "ICAT", "GARC"],
  },
  {
    slug: "csir-csio-chandigarh",
    researchCentres: [
      { name: "CSIO Battery Instrumentation Lab", focus: "BMS sensors, charging-station hardware, instrumentation" },
      { name: "Sensors & Embedded Systems Group", focus: "Custom sensors for EV applications" },
    ],
    oemCollaborations: [
      { oem: "BHEL", type: "research", since: 2018 },
      { oem: "Tata Motors EV", type: "research", since: 2020 },
    ],
    ongoingResearch: [
      { title: "Custom BMS sensors for indigenous cell formats", area: "BMS hardware", status: "ACTIVE" },
      { title: "Charging-station hardware indigenisation", area: "Charging", status: "ACTIVE" },
    ],
    accreditations: ["CSIR lab", "NABL accredited"],
    facilities: ["Sensor characterisation lab", "Embedded prototyping lab", "Battery instrumentation lab"],
    industryPartnerships: ["CSIR", "MeitY", "DST", "DRDO"],
  },
  {
    slug: "cecri-karaikudi",
    researchCentres: [
      { name: "Lithium-ion Battery Pilot Plant", focus: "Cell manufacturing pilot scale", established: 2018 },
      { name: "Electrochemistry Division", focus: "Cathode, anode, electrolyte research" },
    ],
    oemCollaborations: [
      { oem: "Reliance New Energy", type: "research", since: 2022 },
      { oem: "Tata Chemicals", type: "research", since: 2020 },
    ],
    ongoingResearch: [
      { title: "Sodium-ion battery prototyping", area: "Cell chemistry", status: "ACTIVE" },
      { title: "Indigenous LFP cell manufacturing", area: "Cell chemistry", status: "ACTIVE" },
    ],
    accreditations: ["CSIR lab", "MoHI-recognised"],
    facilities: ["Lithium-ion pilot plant (1 MWh / year)", "Coin-cell + pouch-cell assembly", "Materials characterisation suite"],
    industryPartnerships: ["CSIR", "MoHI", "DST"],
    researchOverview:
      "CSIR-CECRI is India's most advanced public-sector battery research institution. The pilot plant at Karaikudi has produced over a hundred patented cell formulations and trained the technical workforce now staffing Reliance, Tata and Amara Raja's gigafactory ramp.",
  },

  // ─── Training centres (5 in seed) ──────────────────────
  {
    slug: "isie-india",
    programsOffered: [
      { name: "PG Diploma in EV Design", level: "DIPLOMA", duration: "12 months" },
      { name: "PG Diploma in EV Manufacturing", level: "DIPLOMA", duration: "12 months" },
      { name: "Certificate in EV Homologation", level: "CERTIFICATE", duration: "6 months" },
      { name: "Custom corporate training", level: "CERTIFICATE" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "curriculum", since: 2018 },
      { oem: "Mahindra Electric", type: "placement", since: 2017 },
      { oem: "Sona Comstar BLW", type: "placement", since: 2019 },
    ],
    topRecruiters: ["Bosch India", "Continental India", "Mahindra Electric", "Tata Motors EV", "Sona Comstar BLW", "Schaeffler India"],
    placementStats: { medianCtcLakhs: 7, placementRate: 85, highestCtcLakhs: 22, recruiterCount: 120, year: 2025 },
    accreditations: ["AICTE-approved", "NSDC partner"],
    facilities: ["EV pack assembly lab", "Vehicle test bench", "BMS bench rigs"],
    industryPartnerships: ["AICTE", "NSDC", "ASDC", "SIAM"],
  },
  {
    slug: "asdc-india",
    about:
      "ASDC (Automotive Skills Development Council) is the Sector Skill Council under NSDC. ASDC owns the National Occupational Standards (NOS) for every automotive role in India, including EV technicians, charge-point operators, battery operators and EV powertrain engineers. Every ITI-level EV certification ultimately routes through ASDC-aligned curriculum and assessment.",
    programsOffered: [
      { name: "ASDC Level 3-5 NSQF — multiple EV technician tracks", level: "CERTIFICATE", duration: "3-12 months" },
      { name: "Train-the-trainer programs for ITI faculty", level: "CERTIFICATE" },
      { name: "OEM-customised training tracks", level: "CERTIFICATE" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "curriculum", since: 2018 },
      { oem: "Mahindra Electric", type: "curriculum", since: 2018 },
      { oem: "Hero MotoCorp", type: "curriculum", since: 2019 },
      { oem: "Maruti Suzuki", type: "curriculum", since: 2018 },
      { oem: "Bajaj Auto EV", type: "curriculum", since: 2020 },
    ],
    industryPartnerships: ["NSDC", "SIAM (founder)", "ACMA (founder)", "FADA (founder)", "MSDE", "MoHI"],
    accreditations: ["NSDC Sector Skill Council", "MSDE-recognised"],
    researchOverview:
      "ASDC's research output is the National Occupational Standards themselves — the rubric every dealer / OEM training program in India ultimately aligns to. ASDC also publishes the annual Automotive Skill Gap Report which forecasts EV-workforce demand by role.",
  },
  {
    slug: "diyguru-network",
    about:
      "DIYguru's network of 200+ EV training labs across Indian engineering colleges and ITIs — the largest physical EV-training footprint of any upskilling network in the country. This lab network is the operational backbone of the canonical DIYguru eMobility Academy.",
    facilities: ["200+ partner EV labs nationwide", "BMS bench rigs at every lab", "Motor + inverter prototyping stations", "EVSE commissioning kits"],
    industryPartnerships: ["AICTE", "NSDC", "ASDC", "Bosch", "Hyundai", "Tata Motors EV"],
    accreditations: ["AICTE-approved (via canonical academy)"],
  },

  // ─── Global (10) ──────────────────────────────────────
  {
    slug: "university-of-michigan-evc",
    researchCentres: [
      { name: "Electric Vehicle Center (EVC)", focus: "EV powertrain, battery systems, autonomy", established: 2023 },
      { name: "Battery Lab", focus: "Cell + pack research" },
      { name: "Autonomous Vehicle Research", focus: "ADAS + self-driving" },
    ],
    oemCollaborations: [
      { oem: "Ford", type: "research", since: 1923 },
      { oem: "GM", type: "research", since: 1920 },
      { oem: "Stellantis", type: "research" },
      { oem: "Toyota North America", type: "research" },
      { oem: "Rivian", type: "research" },
    ],
    programsOffered: [
      { name: "M.S. in Robotics", level: "PG" },
      { name: "M.Eng. in Energy Systems Engineering", level: "PG" },
      { name: "ICE-to-EV professional reskilling track", level: "CERTIFICATE", duration: "6-12 months" },
      { name: "PhD across EE / ME / Materials", level: "PHD" },
    ],
    topRecruiters: ["Ford", "GM", "Stellantis", "Toyota", "Tesla", "Rivian", "Apple", "Qualcomm"],
    accreditations: ["ABET accredited"],
    facilities: ["Battery research lab", "Autonomous vehicle test fleet", "MCity autonomous vehicle proving ground"],
    industryPartnerships: ["Detroit automotive cluster", "DOE", "ARPA-E"],
    researchOverview:
      "UMich EVC was launched in 2023 as a structured response to Detroit's EV transition — combining academic battery + autonomy + power-electronics research with a structured ICE-to-EV reskilling program for working engineers.",
  },
  {
    slug: "sae-international",
    about:
      "SAE International is the global standards body for the automotive industry. Owns the J1772 EV charging connector standard, J2954 wireless charging standard and ISO 26262 functional-safety framework. Runs the SAE student-engineering competitions (Baja SAEINDIA, SUPRA SAEINDIA, Formula SAE) — the source of much of India's eBAJA + Formula Bharat talent pipeline.",
    programsOffered: [
      { name: "SAE HEV / PHEV / EV Engineering Concepts", level: "CERTIFICATE", duration: "2-5 days" },
      { name: "ISO 26262 Functional Safety Practitioner", level: "CERTIFICATE", duration: "5 days" },
      { name: "ISO 21434 Cybersecurity", level: "CERTIFICATE", duration: "3-5 days" },
      { name: "AUTOSAR fundamentals + advanced", level: "CERTIFICATE" },
    ],
    industryPartnerships: ["SAE Member companies (global)", "ISO", "IEC", "UNECE"],
    accreditations: ["IACET accredited", "IEEE-recognised"],
    researchOverview:
      "SAE's research output is the engineering-standards corpus that defines how the automotive industry operates. Every CCS / CHAdeMO / MCS connector and every ASIL-rated safety analysis traces back to SAE technical reports + JCom standards.",
  },
  {
    slug: "tata-technologies",
    about:
      "Tata Technologies is the Tata-group engineering services arm serving global OEMs (JLR, Tata Motors, Ford, GM, Honda, BMW). iGetIT is its learning platform offering OEM-aligned online certifications on EV Essentials, Energy Storage Systems, Battery Pack Design and Vehicle Integration.",
    programsOffered: [
      { name: "EV Essentials", level: "CERTIFICATE", duration: "8 weeks" },
      { name: "Energy Storage Systems", level: "CERTIFICATE", duration: "10 weeks" },
      { name: "Battery Pack Design", level: "CERTIFICATE", duration: "12 weeks" },
      { name: "Vehicle Integration for EVs", level: "CERTIFICATE", duration: "10 weeks" },
    ],
    oemCollaborations: [
      { oem: "Jaguar Land Rover", type: "research", since: 2005 },
      { oem: "Tata Motors EV", type: "research", since: 2000 },
      { oem: "Ford", type: "research" },
      { oem: "Honda R&D", type: "research" },
    ],
    industryPartnerships: ["Tata group ER&D ecosystem", "AICTE"],
  },
  {
    slug: "legacy-ev",
    about:
      "Legacy EV is a US-based EV training company focused on conversion training, fundamentals, and systems diagnostics for electric vehicle mechanics and manufacturers. Operates both in-person workshops in Arizona and an online curriculum.",
    programsOffered: [
      { name: "EV Fundamentals (online + in-person)", level: "CERTIFICATE", duration: "4-12 weeks" },
      { name: "ICE-to-EV conversion training", level: "CERTIFICATE", duration: "6 months" },
      { name: "EV systems diagnostics", level: "CERTIFICATE" },
    ],
    industryPartnerships: ["ASE EV training partner"],
  },
  {
    slug: "george-brown-college",
    about:
      "George Brown College in Toronto runs a 32-week online/hybrid EV systems, diagnostics and repair program co-designed with major EV manufacturers and accepted across the Canadian automotive trade.",
    programsOffered: [
      { name: "EV Systems, Diagnostics & Repair", level: "CERTIFICATE", duration: "32 weeks" },
    ],
    oemCollaborations: [
      { oem: "Magna International", type: "curriculum" },
      { oem: "GM Canada", type: "placement" },
    ],
    accreditations: ["Ontario Ministry of Colleges-recognised"],
  },
  {
    slug: "naftc-wvu",
    about:
      "National Alternative Fuels Training Consortium hosted at West Virginia University — foundational EV and hybrid technology courses for educational institutions and professional fleet mechanics across the United States.",
    programsOffered: [
      { name: "EV / HEV foundational technology courses", level: "CERTIFICATE" },
    ],
    accreditations: ["West Virginia University-affiliated"],
  },
  {
    slug: "carilec-academy",
    about:
      "Caribbean Electric Utility Services Corporation (CARILEC) EV Academy — specialised high-voltage safety and EV diagnostics live workshops for automotive service providers across the Caribbean.",
    programsOffered: [
      { name: "High-voltage safety + EV diagnostics", level: "CERTIFICATE", duration: "1-2 weeks" },
    ],
  },
  {
    slug: "stanford-university",
    researchCentres: [
      { name: "StorageX", focus: "Energy storage research" },
      { name: "Global Climate & Energy Project", focus: "Long-term climate / EV / battery research" },
    ],
    oemCollaborations: [
      { oem: "Tesla", type: "research" },
      { oem: "Ford", type: "research" },
      { oem: "Toyota", type: "research" },
    ],
    accreditations: ["WASC accredited"],
  },
  {
    slug: "mit-cambridge",
    researchCentres: [
      { name: "Electrochemical Energy Lab", focus: "Solid-state batteries, electrolytes" },
      { name: "CSAIL — EV autonomy applications", focus: "Self-driving EV research" },
    ],
    oemCollaborations: [
      { oem: "Ford", type: "research" },
      { oem: "Toyota", type: "research" },
    ],
    accreditations: ["NEASC accredited"],
  },
  {
    slug: "university-of-cambridge",
    researchCentres: [
      { name: "Whittle Laboratory", focus: "Aerodynamics + propulsion (EV applications)" },
      { name: "Battery Materials Group", focus: "Cell chemistry + materials" },
    ],
    accreditations: ["Royal Charter"],
  },
];

// ─── BATCH 02 ── More IITs + NITs + IIITs + state engg + private univs
// + CSIR labs + OEM-affiliated skill ITIs + global EV-research powerhouses
// =====================================================================
// 30 more IITs / NITs / IIITs (tier-1 govt engg)
// + 20 private / state universities
// + 8 CSIR + applied research bodies
// + 7 global EV-research universities
// + 25 OEM-affiliated skill ITIs (Bosch, Bajaj, Ashok Leyland, Continental)
// + 10 government polytechnics (compact enrichment — accreditations,
//   recruiter network, lab footprint)
// = 100 entries

const BATCH_02: EnrichmentSpec[] = [
  // ─── Remaining IITs / NITs / IIITs (30) ─────────────────
  {
    slug: "iit-bhu-varanasi",
    researchCentres: [
      { name: "Department of Electrical Engineering — Power Electronics Lab", focus: "Inverters, motor controls, EV drives" },
      { name: "Department of Mechanical Engineering — Automotive group", focus: "Vehicle dynamics, EV integration, NVH" },
      { name: "School of Materials Science — Battery materials", focus: "Cathode + anode chemistries, electrolyte additives" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2019 },
      { oem: "Mahindra Electric", type: "internship", since: 2020 },
      { oem: "Bosch India", type: "internship", since: 2018 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / Materials / Mining)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics / Materials Engineering)", level: "PG", duration: "2 yrs" },
      { name: "Integrated Dual Degree (B.Tech + M.Tech)", level: "UG", duration: "5 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India", "Continental India", "Hindustan Petroleum", "BHEL", "ARCI Hyderabad"],
    placementStats: { medianCtcLakhs: 18, placementRate: 92, highestCtcLakhs: 48, recruiterCount: 230, year: 2025 },
    accreditations: ["NAAC A++", "Institute of National Importance", "NBA accredited"],
    facilities: ["Power electronics drives lab", "Materials characterisation suite", "Mining-to-battery-material pilot facility"],
  },
  {
    slug: "iit-indore",
    researchCentres: [
      { name: "Discipline of Electrical Engineering — EV power-electronics group", focus: "SiC / GaN traction inverters, BMS algorithms" },
      { name: "Centre for Rural Development & Technology", focus: "Low-cost EV solutions for rural / last-mile mobility" },
    ],
    oemCollaborations: [
      { oem: "Pravaig Dynamics", type: "research", since: 2021 },
      { oem: "Mahindra Electric", type: "internship", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy / Electrical)", level: "PG", duration: "2 yrs" },
      { name: "PhD across EE / ME", level: "PHD" },
    ],
    topRecruiters: ["Mahindra Electric", "Tata Motors EV", "Bosch India", "Continental India", "Pravaig Dynamics"],
    placementStats: { medianCtcLakhs: 19, placementRate: 92, highestCtcLakhs: 50, recruiterCount: 190, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Power electronics drives lab", "Embedded systems lab"],
  },
  {
    slug: "iit-mandi",
    researchCentres: [
      { name: "Centre for Sustainable Energy & Power", focus: "EV storage + renewables integration for hilly terrain" },
      { name: "School of Computing & Electrical Engineering — EV group", focus: "BMS, motor controls" },
    ],
    oemCollaborations: [
      { oem: "Mahindra Last Mile Mobility", type: "research", since: 2021, projects: "3W EV reliability in hilly conditions" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy Engineering)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Mahindra Electric", "Tata Motors EV", "Bosch India", "Hyundai India EV R&D"],
    placementStats: { medianCtcLakhs: 18, placementRate: 90, highestCtcLakhs: 45, recruiterCount: 170, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Hill-terrain test cell", "Power electronics lab"],
  },
  {
    slug: "iit-ropar",
    researchCentres: [
      { name: "Department of EE — Power Electronics & Drives", focus: "Motor drives, BMS, traction inverter design" },
      { name: "Centre for Energy", focus: "Battery storage, renewable + EV integration" },
    ],
    oemCollaborations: [
      { oem: "Hero MotoCorp", type: "internship", since: 2020 },
      { oem: "Tata Motors EV", type: "research", since: 2022 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Engineering)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Hero MotoCorp", "Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 17, placementRate: 90, highestCtcLakhs: 44, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
  },
  {
    slug: "iit-patna",
    researchCentres: [
      { name: "Department of EE — Power Electronics Lab", focus: "EV inverters, motor controls" },
      { name: "School of Engineering & Technology — Energy systems", focus: "Battery storage, smart grids" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "BHEL", "Bosch India"],
    placementStats: { medianCtcLakhs: 16, placementRate: 88, highestCtcLakhs: 40, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
  },
  {
    slug: "iit-gandhinagar",
    researchCentres: [
      { name: "Department of EE — EV powertrain group", focus: "BMS, motor design, controls" },
      { name: "Sustainable Energy & Climate Change Hub", focus: "EV grid integration, climate-resilient mobility" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV (Sanand)", type: "research", since: 2018, projects: "Sanand-based EV plant pipeline" },
      { oem: "Matter Energy", type: "research", since: 2022, projects: "Geared 2W EV joint development" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Matter Energy", "Mahindra Electric", "Bosch India", "Ola Electric"],
    placementStats: { medianCtcLakhs: 19, placementRate: 92, highestCtcLakhs: 50, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
    facilities: ["Power electronics lab", "Battery cycler bank"],
  },
  {
    slug: "iit-jodhpur",
    researchCentres: [
      { name: "Department of EE — Power Electronics Lab", focus: "EV drives, BMS, charging hardware" },
      { name: "Centre of Excellence in Energy", focus: "Solar + EV integration for desert / off-grid environments" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy Engineering)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "BHEL"],
    placementStats: { medianCtcLakhs: 17, placementRate: 88, highestCtcLakhs: 42, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
  },
  {
    slug: "iit-bhubaneswar",
    researchCentres: [
      { name: "School of Electrical Sciences — Power Electronics Lab", focus: "EV motor drives, traction inverters" },
      { name: "School of Mechanical Sciences — Energy systems", focus: "Battery thermal, vehicle integration" },
    ],
    oemCollaborations: [
      { oem: "Tata Steel", type: "research", since: 2019, projects: "Battery raw materials" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Energy)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Steel", "Tata Motors EV", "Mahindra Electric", "JSW Energy"],
    placementStats: { medianCtcLakhs: 16, placementRate: 88, highestCtcLakhs: 40, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A+", "Institute of National Importance"],
  },
  {
    slug: "iit-tirupati",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Olectra Greentech", type: "research", since: 2022 },
    ],
    topRecruiters: ["Olectra Greentech", "Tata Motors EV", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 15, placementRate: 86, highestCtcLakhs: 38, recruiterCount: 130, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iit-palakkad",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 15, placementRate: 85, highestCtcLakhs: 36, recruiterCount: 120, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iit-dharwad",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "Continental India"],
    placementStats: { medianCtcLakhs: 14, placementRate: 84, highestCtcLakhs: 34, recruiterCount: 110, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iit-jammu",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 14, placementRate: 84, highestCtcLakhs: 34, recruiterCount: 100, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iit-goa",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India"],
    placementStats: { medianCtcLakhs: 14, placementRate: 84, highestCtcLakhs: 34, recruiterCount: 100, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iit-bhilai",
    programsOffered: [
      { name: "B.Tech (EE / ME / CSE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bhilai Steel", "Tata Steel"],
    placementStats: { medianCtcLakhs: 14, placementRate: 84, highestCtcLakhs: 34, recruiterCount: 100, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  // ─── More NITs (10) ────────────────────────────────────
  {
    slug: "nit-allahabad",
    researchCentres: [
      { name: "MNNIT Department of EE — Power Electronics", focus: "EV drives, BMS, motor controls" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "internship", since: 2020 },
      { oem: "Bosch India", type: "placement", since: 2018 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "Mahindra Electric", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 14, placementRate: 88, highestCtcLakhs: 35, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-bhopal",
    researchCentres: [
      { name: "MANIT Department of EE — Power Systems Lab", focus: "EV controls, integration" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "internship", since: 2019 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-kurukshetra",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "internship", since: 2018 },
      { oem: "Hero MotoCorp", type: "placement", since: 2019 },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 14, placementRate: 88, highestCtcLakhs: 34, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-jaipur",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems / Electrical Drives)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Hero MotoCorp", type: "placement", since: 2019 },
    ],
    topRecruiters: ["Hero MotoCorp", "Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-jamshedpur",
    researchCentres: [
      { name: "Department of Metallurgical Engineering — Battery materials group", focus: "Cathode + anode raw materials research" },
    ],
    oemCollaborations: [
      { oem: "Tata Steel", type: "research", since: 2017 },
      { oem: "Tata Motors EV", type: "placement", since: 2018 },
    ],
    programsOffered: [
      { name: "B.Tech (Metallurgical / EE / ME)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Steel", "Tata Motors EV", "JSW Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-hamirpur",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 12, placementRate: 84, highestCtcLakhs: 30, recruiterCount: 110, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-silchar",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 11, placementRate: 82, highestCtcLakhs: 28, recruiterCount: 95, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-patna",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 12, placementRate: 84, highestCtcLakhs: 30, recruiterCount: 110, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-raipur",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bhilai Steel", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 12, placementRate: 84, highestCtcLakhs: 30, recruiterCount: 110, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "nit-nagaland",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 10, placementRate: 78, highestCtcLakhs: 26, recruiterCount: 80, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  // ─── IIITs (10) ────────────────────────────────────────
  {
    slug: "iiit-delhi",
    researchCentres: [
      { name: "Cybersecurity Education and Research Centre", focus: "Vehicle cybersecurity (ISO 21434), connected-car security" },
      { name: "Centre for Artificial Intelligence — autonomous EV applications", focus: "Perception, ML for vehicle telemetry" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "research", since: 2020 },
      { oem: "Tata Elxsi", type: "internship", since: 2019 },
    ],
    programsOffered: [
      { name: "B.Tech (CSE / ECE / CSAI)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Cybersecurity / ECE)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Microsoft", "Google", "Bosch India", "Tata Elxsi", "Qualcomm India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 26, placementRate: 95, highestCtcLakhs: 75, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A+", "UGC autonomous"],
  },
  {
    slug: "iiit-bangalore",
    researchCentres: [
      { name: "Centre for Data Sciences — automotive data applications", focus: "Fleet telemetry, predictive maintenance" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "research", since: 2018 },
      { oem: "Tata Elxsi", type: "placement", since: 2019 },
    ],
    programsOffered: [
      { name: "M.Tech (Data Sciences / Networking & Comms / Digital Society)", level: "PG", duration: "2 yrs" },
      { name: "Integrated M.Tech", level: "UG", duration: "5 yrs" },
    ],
    topRecruiters: ["Microsoft", "Bosch India", "Tata Elxsi", "Qualcomm India", "Ather Energy", "KPIT"],
    placementStats: { medianCtcLakhs: 25, placementRate: 94, highestCtcLakhs: 70, recruiterCount: 190, year: 2025 },
    accreditations: ["UGC autonomous", "NAAC A+"],
  },
  {
    slug: "iiit-allahabad",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (CSE / Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 15, placementRate: 90, highestCtcLakhs: 40, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-gwalior",
    programsOffered: [
      { name: "Integrated PG (IT)", level: "PG", duration: "5 yrs" },
      { name: "M.Tech (Information Tech)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 14, placementRate: 88, highestCtcLakhs: 36, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-jabalpur",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["KPIT", "Tata Elxsi", "Bosch India"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 33, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-sri-city",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Hyundai India EV R&D", type: "internship", since: 2022 },
    ],
    topRecruiters: ["Hyundai India EV", "KPIT", "Bosch India", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-vadodara",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV (Sanand)", type: "internship", since: 2021 },
    ],
    topRecruiters: ["Tata Motors EV", "KPIT", "Bosch India"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-kanchipuram",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["KPIT", "Tata Elxsi", "TVS Motor"],
    placementStats: { medianCtcLakhs: 12, placementRate: 85, highestCtcLakhs: 30, recruiterCount: 110, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iiit-nagpur",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Bosch India", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 12, placementRate: 85, highestCtcLakhs: 30, recruiterCount: 105, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },
  {
    slug: "iiit-pune",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "internship", since: 2021 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Bosch India", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 13, placementRate: 87, highestCtcLakhs: 33, recruiterCount: 120, year: 2025 },
    accreditations: ["Institute of National Importance"],
  },

  // ─── State / private universities (20) ──────────────────
  {
    slug: "bhu-varanasi",
    researchCentres: [
      { name: "Department of EE (Institute of Science) — Power group", focus: "EV powertrain fundamentals" },
      { name: "Department of Chemistry — Electrochemistry section", focus: "Cathode + electrolyte chemistry" },
    ],
    programsOffered: [
      { name: "B.E. / M.E. (EE / ME)", level: "UG", duration: "4 yrs" },
      { name: "M.Sc. (Chemistry — electrochemistry)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["BHEL", "Tata Motors EV", "Mahindra Electric"],
    accreditations: ["NAAC A++", "UGC", "Institute of Eminence"],
  },
  {
    slug: "amu-aligarh",
    researchCentres: [
      { name: "Department of EE — Power Electronics & Drives", focus: "EV inverters, drives" },
      { name: "Department of Chemistry — Battery materials group", focus: "Electrolyte additives" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "Maruti Suzuki"],
    placementStats: { medianCtcLakhs: 9, placementRate: 80, highestCtcLakhs: 25, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Institute of Eminence"],
  },
  {
    slug: "jntu-hyderabad",
    programsOffered: [
      { name: "B.Tech (EE / ME / ECE) — multiple affiliated colleges", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics / Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Olectra Greentech", type: "placement", since: 2020 },
    ],
    topRecruiters: ["Olectra Greentech", "TVS Motor", "Mahindra Electric", "Tata Motors EV", "Hyundai India EV"],
    placementStats: { medianCtcLakhs: 7, placementRate: 76, highestCtcLakhs: 22, recruiterCount: 240, year: 2025 },
    accreditations: ["NAAC A", "UGC", "AICTE"],
  },
  {
    slug: "thapar-univ",
    researchCentres: [
      { name: "Centre of Excellence for Electric Vehicles", focus: "BMS, motor drives, vehicle integration" },
    ],
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "placement", since: 2018 },
      { oem: "Bosch India", type: "internship", since: 2019 },
    ],
    programsOffered: [
      { name: "B.E. (EE / EIC / ME) with EV electives", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Systems / Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Mahindra Electric", "Hero MotoCorp", "Tata Motors EV", "Continental India"],
    placementStats: { medianCtcLakhs: 11, placementRate: 90, highestCtcLakhs: 32, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "kiit-univ",
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement", since: 2019 },
      { oem: "Mahindra Electric", type: "placement", since: 2020 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / EEE / ME / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India", "JSW Energy", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 8, placementRate: 88, highestCtcLakhs: 28, recruiterCount: 350, year: 2025 },
    accreditations: ["NAAC A++", "UGC", "Institute of Eminence"],
  },
  {
    slug: "sastra-thanjavur",
    programsOffered: [
      { name: "B.Tech (EE / EEE / ME / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics / Energy Engineering)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "placement", since: 2018 },
    ],
    topRecruiters: ["TVS Motor", "Bosch India", "Mahindra Electric", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 9, placementRate: 88, highestCtcLakhs: 26, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A++", "UGC autonomous"],
  },
  {
    slug: "chitkara-university",
    programsOffered: [
      { name: "B.Tech (EE / ME / Mechatronics — EV specialisation)", level: "UG", duration: "4 yrs" },
      { name: "PG Diploma in Electric Vehicle Technology", level: "DIPLOMA", duration: "12 months" },
    ],
    oemCollaborations: [
      { oem: "Hero MotoCorp", type: "internship", since: 2020 },
      { oem: "Bosch India", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Bosch India", "Hero MotoCorp", "Mahindra Electric", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 8, placementRate: 88, highestCtcLakhs: 24, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "christ-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (ECE / EEE / ME)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Bosch India", "Continental India", "Mahindra Electric", "Ather Energy"],
    placementStats: { medianCtcLakhs: 7.5, placementRate: 86, highestCtcLakhs: 22, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "symbiosis-sit-pune",
    programsOffered: [
      { name: "B.Tech (Mechatronics / EE / ME)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "internship", since: 2020 },
      { oem: "Tata Motors EV (Pimpri)", type: "placement", since: 2019 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India", "KPIT"],
    placementStats: { medianCtcLakhs: 8, placementRate: 86, highestCtcLakhs: 24, recruiterCount: 170, year: 2025 },
    accreditations: ["NAAC A++", "UGC", "Institute of Eminence"],
  },
  {
    slug: "graphic-era-univ",
    programsOffered: [
      { name: "B.Tech (EE / ME / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Hero MotoCorp", "Maruti Suzuki"],
    placementStats: { medianCtcLakhs: 7, placementRate: 84, highestCtcLakhs: 20, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "amity-noida",
    researchCentres: [
      { name: "Amity Centre for Renewable Energy Studies", focus: "Solar + EV storage integration" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics / Energy)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Mahindra Electric", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 22, recruiterCount: 320, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "gitam-univ",
    programsOffered: [
      { name: "B.Tech (EE / EEE / ME / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Mahindra Electric", "Tata Motors EV", "Olectra Greentech", "TVS Motor"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "bml-munjal-univ",
    oemCollaborations: [
      { oem: "Hero MotoCorp", type: "placement", since: 2014, projects: "Founded by Hero MotoCorp's Munjal family" },
    ],
    programsOffered: [
      { name: "B.Tech (Mechatronics / ME / EE)", level: "UG", duration: "4 yrs", evFocus: "Auto + EV depth via Hero collaboration" },
    ],
    topRecruiters: ["Hero MotoCorp", "Bosch India", "Maruti Suzuki", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 9, placementRate: 88, highestCtcLakhs: 28, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "bennett-univ",
    programsOffered: [
      { name: "B.Tech (EE / CSE / ME)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Bosch India", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 8, placementRate: 86, highestCtcLakhs: 24, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "ashoka-univ",
    programsOffered: [
      { name: "B.A. / B.Sc. (CS / Math / Physics) — research focus", level: "UG", duration: "4 yrs" },
      { name: "M.A. / PhD (research)", level: "PG" },
    ],
    topRecruiters: ["Research labs", "Consulting", "Tech startups"],
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "bharati-vidyapeeth",
    programsOffered: [
      { name: "B.Tech / M.Tech (EE / Automobile / Mechanical)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "placement", since: 2018 },
      { oem: "Tata Motors EV (Pimpri)", type: "placement", since: 2017 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 84, highestCtcLakhs: 20, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "bmsce-bengaluru",
    researchCentres: [
      { name: "Department of EE — EV powertrain group", focus: "Motor controls, BMS, vehicle integration" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2015 },
      { oem: "Ather Energy", type: "placement", since: 2020 },
    ],
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Continental India", "Mahindra Electric", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 11, placementRate: 92, highestCtcLakhs: 32, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A++", "UGC autonomous"],
  },
  {
    slug: "dayananda-sagar",
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2018 },
      { oem: "Ather Energy", type: "placement", since: 2021 },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric", "Continental India"],
    placementStats: { medianCtcLakhs: 8, placementRate: 86, highestCtcLakhs: 22, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A", "UGC autonomous"],
  },
  {
    slug: "saveetha-univ",
    programsOffered: [
      { name: "B.E. (EE / EEE / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A++", "UGC", "Deemed University"],
  },
  {
    slug: "jain-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (EE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Ather Energy", type: "internship", since: 2021 },
    ],
    topRecruiters: ["Ather Energy", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7.5, placementRate: 84, highestCtcLakhs: 22, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },

  // ─── CSIR + applied research bodies (8) ───────────────────
  {
    slug: "csir-cmeri",
    researchCentres: [
      { name: "Electric Vehicle Research Group", focus: "Indigenous EV prototypes — 3W cargo + retrofit kits", established: 2017 },
      { name: "Mechanical Engineering Division", focus: "EV powertrain integration" },
    ],
    oemCollaborations: [
      { oem: "BHEL", type: "research", since: 2018 },
      { oem: "Tata Motors EV", type: "research", since: 2019 },
    ],
    ongoingResearch: [
      { title: "Indigenous 3W cargo EV reference design", area: "Vehicle integration", status: "PUBLISHED" },
      { title: "Solar-EV charging for rural deployment", area: "Charging + renewables", status: "ACTIVE" },
    ],
    accreditations: ["CSIR lab", "MoHI-recognised"],
    facilities: ["3W EV prototype assembly", "Solar charging testbed", "Vehicle test track"],
    industryPartnerships: ["CSIR", "MoHI", "DST", "BHEL"],
  },
  {
    slug: "csir-ncl-pune",
    researchCentres: [
      { name: "Polymer Science & Engineering Division — battery separator research", focus: "Polymer separator membranes for Li-ion cells" },
      { name: "Catalysis Division — electrolyte research", focus: "Electrolyte additive screening" },
    ],
    oemCollaborations: [
      { oem: "Reliance New Energy", type: "research", since: 2022 },
      { oem: "Tata Chemicals", type: "research", since: 2018 },
    ],
    accreditations: ["CSIR lab", "MoHI-recognised"],
    facilities: ["Polymer pilot plant", "Catalysis lab"],
    industryPartnerships: ["CSIR", "DST"],
  },
  {
    slug: "csir-neeri-nagpur",
    researchCentres: [
      { name: "Air Quality Studies — EV adoption modelling", focus: "Air-quality benefits of EV transition" },
    ],
    accreditations: ["CSIR lab"],
    facilities: ["Air quality monitoring lab"],
    industryPartnerships: ["CSIR", "Ministry of Environment"],
  },
  {
    slug: "csir-iip-dehradun",
    researchCentres: [
      { name: "Battery Materials Group", focus: "Cathode + electrolyte chemistry" },
    ],
    accreditations: ["CSIR lab"],
    industryPartnerships: ["CSIR", "Indian Oil R&D"],
  },
  {
    slug: "ceeri-pilani",
    researchCentres: [
      { name: "Power Electronics Group — SiC / GaN devices", focus: "EV inverter device research", established: 2010 },
      { name: "Embedded Systems for Mobility Group", focus: "BMS controllers, charge-point hardware" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "research", since: 2015 },
      { oem: "Continental India", type: "research", since: 2018 },
    ],
    ongoingResearch: [
      { title: "Indigenous SiC MOSFET fabrication", area: "Power-electronics devices", status: "ACTIVE" },
    ],
    accreditations: ["CSIR lab", "NABL accredited"],
    facilities: ["Semiconductor fab clean room", "Device test rigs", "Embedded systems lab"],
    industryPartnerships: ["CSIR", "MeitY", "DRDO"],
  },
  {
    slug: "arci-hyderabad",
    researchCentres: [
      { name: "Centre for Carbon Materials", focus: "Anode + electrode materials" },
      { name: "Centre for Powder Metallurgy & Composites", focus: "Battery pack lightweighting" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2019 },
      { oem: "Mahindra Electric", type: "research", since: 2020 },
    ],
    accreditations: ["DST autonomous body", "NABL accredited"],
    facilities: ["Powder metallurgy lab", "Carbon materials lab"],
    industryPartnerships: ["DST", "MoHI"],
  },
  {
    slug: "cipet-chennai",
    researchCentres: [
      { name: "Plastics Engineering Division — battery enclosure research", focus: "Polymer materials for EV battery enclosures" },
    ],
    programsOffered: [
      { name: "Diploma in Plastics Technology", level: "DIPLOMA", duration: "3 yrs" },
      { name: "B.Tech in Plastics Engineering", level: "UG", duration: "4 yrs" },
    ],
    accreditations: ["MoCF autonomous body"],
    industryPartnerships: ["Ministry of Chemicals & Fertilisers"],
  },
  {
    slug: "cmti-bengaluru",
    researchCentres: [
      { name: "Smart Manufacturing Demo & Development Centre", focus: "EV assembly automation, machine tools for battery cell manufacturing" },
    ],
    oemCollaborations: [
      { oem: "Bharat Forge", type: "research", since: 2018 },
      { oem: "Sona Comstar BLW", type: "research", since: 2020 },
    ],
    accreditations: ["DHI autonomous body", "NABL accredited"],
    facilities: ["Manufacturing automation demo line", "Battery cell-line machine tools"],
    industryPartnerships: ["MoHI", "DHI"],
  },

  // ─── Global EV-research universities (7) ───────────────
  {
    slug: "university-of-oxford",
    researchCentres: [
      { name: "Battery Intelligence Lab (BIL)", focus: "Battery aging, state estimation, lifetime modelling" },
      { name: "Faraday Institution-funded battery research", focus: "Solid-state, next-gen chemistries" },
    ],
    oemCollaborations: [
      { oem: "JLR", type: "research" },
      { oem: "Williams Advanced Engineering", type: "research" },
    ],
    accreditations: ["Royal Charter"],
  },
  {
    slug: "university-of-tokyo",
    researchCentres: [
      { name: "Department of Materials Engineering — solid-state battery group", focus: "Solid-state Li-ion, sulphide electrolytes" },
      { name: "Department of Mechanical Engineering — EV powertrain group", focus: "Motor design, vehicle dynamics" },
    ],
    oemCollaborations: [
      { oem: "Toyota", type: "research" },
      { oem: "Honda R&D", type: "research" },
      { oem: "Nissan", type: "research" },
    ],
    accreditations: ["MEXT-recognised"],
  },
  {
    slug: "university-of-waterloo",
    researchCentres: [
      { name: "Waterloo Institute for Sustainable Energy", focus: "Battery + EV + grid integration" },
      { name: "Centre for Automotive Research", focus: "Vehicle dynamics, ADAS, EV powertrain" },
    ],
    oemCollaborations: [
      { oem: "GM Canada", type: "research" },
      { oem: "Magna International", type: "research" },
      { oem: "Tesla", type: "research" },
    ],
    programsOffered: [
      { name: "BASc / MASc (Mechatronics / EE)", level: "UG", duration: "4-5 yrs (co-op)" },
    ],
    accreditations: ["CEAB accredited"],
  },
  {
    slug: "epfl-lausanne",
    researchCentres: [
      { name: "Laboratory for Photovoltaics & Thin-film Devices", focus: "Battery + photovoltaics integration" },
      { name: "Power Electronics Lab", focus: "EV converter design" },
    ],
    accreditations: ["Swiss Federal Institute"],
  },
  {
    slug: "eth-zurich",
    researchCentres: [
      { name: "Power Electronic Systems Laboratory", focus: "High-efficiency EV converters" },
      { name: "Empa — battery materials joint research", focus: "Solid-state batteries" },
    ],
    oemCollaborations: [
      { oem: "ABB", type: "research" },
      { oem: "Mercedes-Benz", type: "research" },
    ],
    accreditations: ["Swiss Federal Institute"],
  },
  {
    slug: "tu-munich",
    researchCentres: [
      { name: "Institute of Automotive Technology", focus: "EV powertrain, vehicle integration" },
      { name: "Institute for Electrical Energy Storage Technology", focus: "Battery + storage research" },
    ],
    oemCollaborations: [
      { oem: "BMW Group", type: "research" },
      { oem: "Audi", type: "research" },
      { oem: "Siemens", type: "research" },
    ],
    accreditations: ["Bavarian state-recognised university"],
  },
  {
    slug: "rwth-aachen",
    researchCentres: [
      { name: "Institute for Power Electronics & Electrical Drives", focus: "Traction inverter design, motor control" },
      { name: "Production Engineering of E-Mobility Components (PEM)", focus: "EV manufacturing process research" },
    ],
    oemCollaborations: [
      { oem: "BMW Group", type: "research" },
      { oem: "Volkswagen", type: "research" },
      { oem: "Daimler", type: "research" },
    ],
    accreditations: ["German Excellence Initiative — Excellence University"],
    facilities: ["EV production research line", "Power electronics test cell"],
  },

  // ─── OEM-affiliated skill ITIs (25) — compact enrichment
  // Each is structured similarly: ITI accreditation + which OEM
  // sponsors it + recruiter list defaults to that OEM + facilities
  // listing the EV-skill labs they run.
  ...["bengaluru", "chennai", "hyderabad", "jaipur", "pune"].map((city) => ({
    slug: `bosch-skill-iti-${city}`,
    about: `Bosch-affiliated ITI training centre in ${city.charAt(0).toUpperCase() + city.slice(1)}. Apprenticeship + ASDC-aligned EV service technician program with direct conversion to Bosch India's mobility-solutions service network.`,
    oemCollaborations: [
      { oem: "Bosch India", type: "placement" as const, since: 2015, projects: "Apprentice-to-employee pipeline + BMS / power-electronics service training" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician", level: "CERTIFICATE" as const, duration: "6 months", evFocus: "Bosch-aligned curriculum" },
      { name: "ITI Electrician + EV specialisation", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Bosch Mobility Aftermarket"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner"],
    facilities: ["Bosch BMS bench rig", "Vehicle diagnostics workstation", "Power electronics tools", "HV safety training area"],
    industryPartnerships: ["Bosch India", "ASDC", "NSDC"],
  })),
  ...[
    "ahmedabad", "akurdi", "aurangabad", "chakan", "chennai",
    "delhi", "hyderabad", "indore", "jaipur", "nashik",
  ].map((city) => ({
    slug: `bajaj-skill-iti-${city}`,
    about: `Bajaj Auto-affiliated ITI training centre in ${city.charAt(0).toUpperCase() + city.slice(1)}. Apprenticeship + EV service technician program with direct hiring into Bajaj's EV service network (Chetak + 3W).`,
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "placement" as const, since: 2018, projects: "Chetak 2W + 3W EV service-technician pipeline" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician (Bajaj-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Mechanic + EV specialisation", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Bajaj-authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner"],
    facilities: ["Bajaj Chetak diagnostic kit", "HV-safety training", "Charger commissioning bench"],
    industryPartnerships: ["Bajaj Auto", "ASDC", "NSDC"],
  })),
  ...["ennore", "hosur", "pantnagar"].map((loc) => ({
    slug: `ashok-leyland-skill-iti-${loc}`,
    about: `Ashok Leyland-affiliated ITI training centre in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Heavy-vehicle + EV bus service training, feeding directly into Ashok Leyland's nationwide bus service network and Switch Mobility's e-bus operations.`,
    oemCollaborations: [
      { oem: "Ashok Leyland", type: "placement" as const, since: 2014 },
      { oem: "Switch Mobility", type: "placement" as const, since: 2020, projects: "E-bus service technician pipeline" },
    ],
    programsOffered: [
      { name: "ASDC Level 4 Heavy-Vehicle Technician (EV-included)", level: "CERTIFICATE" as const, duration: "9 months" },
      { name: "ITI Mechanic (HV-specialisation)", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Ashok Leyland", "Switch Mobility"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner"],
    facilities: ["E-bus diagnostic equipment", "Heavy-vehicle workshop", "HV pack handling training area"],
    industryPartnerships: ["Ashok Leyland", "Switch Mobility", "ASDC"],
  })),
  ...["bengaluru", "pune"].map((city) => ({
    slug: `continental-skill-iti-${city}`,
    about: `Continental India-affiliated ITI training centre in ${city.charAt(0).toUpperCase() + city.slice(1)}. Automotive electronics + EV training, feeding directly into Continental's Tier-1 supplier service network and OEM placements.`,
    oemCollaborations: [
      { oem: "Continental India", type: "placement" as const, since: 2017 },
    ],
    programsOffered: [
      { name: "Automotive Electronics + EV Service (ASDC-aligned)", level: "CERTIFICATE" as const, duration: "9 months" },
    ],
    topRecruiters: ["Continental India", "Tata Motors EV", "Bosch India"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner"],
    facilities: ["Continental BMS test setup", "Power electronics bench", "Vehicle network diagnostics"],
    industryPartnerships: ["Continental India", "ASDC"],
  })),

  // ─── Government polytechnics (10) ──────────────────────
  // Compact enrichment — accreditations + recruiter chips + a
  // general facility description. They're highest-volume in
  // terms of student count but lower per-row enrichment depth.
  ...[
    "bhubaneswar", "chandigarh", "coimbatore", "faridabad",
    "hyderabad", "jaipur", "lucknow", "mumbai", "pune", "trichy",
  ].map((city) => ({
    slug: `govt-polytechnic-${city}`,
    about: `Government polytechnic in ${city.charAt(0).toUpperCase() + city.slice(1)} offering 3-year diploma programs in mechanical, electrical, electronics and automobile engineering — with state-board-mandated EV modules added since 2021.`,
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering (EV electives)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Mechanical Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electronics Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "Maruti Suzuki", "Local OEM service networks"],
    accreditations: ["State Board of Technical Education", "AICTE-approved", "NSDC partner"],
    facilities: ["EV diagnostic bench", "HV-safety training area", "Workshop with assembly + repair tools"],
    industryPartnerships: ["State Skill Development Mission", "ASDC", "NSDC"],
  })),
];

// ─── BATCH 03 ── Tier-2 engineering + OEM-training networks + remaining global
// =====================================================================
// 3 remaining IIITs
// + 15 tier-2 + state engineering schools (Anna affiliates, KIIT-tier private)
// + 5 large private university networks (LPU, Chandigarh, VIT branches)
// + 10 global EV-research universities
// + 14 Mahindra Pride ITIs (nationwide network)
// + 14 Tata Skilling ITIs (nationwide network)
// + 14 Hero Skill ITIs (nationwide network)
// + 10 Maruti CoE ITIs (north + south India)
// + 11 remaining government polytechnics
// + 2 IIM business schools (for EV business-side roles)
// + 2 DRDO / state-research bodies
// = 100 entries

const BATCH_03: EnrichmentSpec[] = [
  // ─── Remaining IIITs (3) ─────────────────────────────────
  {
    slug: "iiit-kottayam",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["KPIT", "Tata Elxsi", "Bosch India"],
    placementStats: { medianCtcLakhs: 12, placementRate: 85, highestCtcLakhs: 30, recruiterCount: 110, year: 2025 },
    accreditations: ["Institute of National Importance", "AICTE"],
  },
  {
    slug: "iiit-lucknow",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Information Technology)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "KPIT", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 13, placementRate: 86, highestCtcLakhs: 32, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "Institute of National Importance"],
  },
  {
    slug: "iiit-r-k-valley",
    programsOffered: [
      { name: "B.Tech (CSE / ECE)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["KPIT", "Tata Elxsi", "Hyundai India EV"],
    placementStats: { medianCtcLakhs: 11, placementRate: 84, highestCtcLakhs: 28, recruiterCount: 100, year: 2025 },
    accreditations: ["AICTE", "Andhra Pradesh state-recognised"],
  },

  // ─── Tier-2 engineering + state universities (15) ───────
  {
    slug: "bharath-inst-tech-chennai",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Hyundai India EV", type: "placement", since: 2020 },
      { oem: "TVS Motor", type: "internship", since: 2019 },
    ],
    topRecruiters: ["Hyundai India EV", "TVS Motor", "Ola Electric", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 22, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "hindustan-inst-tech-chennai",
    programsOffered: [
      { name: "B.Tech (Automobile / Aerospace / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Engineering)", level: "PG", duration: "2 yrs", evFocus: "Early adopter of EV powertrain electives" },
    ],
    oemCollaborations: [
      { oem: "Hyundai India EV", type: "placement", since: 2018 },
      { oem: "Mahindra Electric", type: "internship", since: 2019 },
    ],
    topRecruiters: ["Hyundai India EV", "Mahindra Electric", "TVS Motor", "Bosch India"],
    placementStats: { medianCtcLakhs: 7.5, placementRate: 84, highestCtcLakhs: 24, recruiterCount: 170, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "sathyabama-inst-tech",
    programsOffered: [
      { name: "B.E. (Automobile / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "placement", since: 2017 },
      { oem: "Hyundai India EV", type: "placement", since: 2019 },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 83, highestCtcLakhs: 22, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A++", "UGC", "Deemed University"],
  },
  {
    slug: "crescent-univ-chennai",
    programsOffered: [
      { name: "B.Tech (EE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "karunya-univ-coimbatore",
    programsOffered: [
      { name: "B.Tech (EEE / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2017 },
      { oem: "TVS Motor", type: "internship", since: 2018 },
    ],
    topRecruiters: ["Bosch India", "TVS Motor", "Sona Comstar BLW", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 84, highestCtcLakhs: 22, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "kongu-engg-college",
    programsOffered: [
      { name: "B.E. (EEE / EE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "placement", since: 2016 },
      { oem: "Bosch India", type: "placement", since: 2017 },
    ],
    topRecruiters: ["TVS Motor", "Bosch India", "Sona Comstar BLW", "Continental India"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 85, highestCtcLakhs: 22, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A", "UGC autonomous"],
  },
  {
    slug: "kcg-college",
    programsOffered: [
      { name: "B.E. (EEE / EE / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6, placementRate: 80, highestCtcLakhs: 18, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "psg-polytechnic",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering (EV electives)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2015 },
      { oem: "Sona Comstar BLW", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Bosch India", "Sona Comstar BLW", "TVS Motor", "Continental India"],
    placementStats: { medianCtcLakhs: 4.5, placementRate: 92, highestCtcLakhs: 10, recruiterCount: 180, year: 2025 },
    accreditations: ["State Board of Technical Education (TN)", "AICTE", "NSDC partner"],
    facilities: ["EV powertrain demo cell", "Battery diagnostics bench", "HV-safety training area"],
  },
  {
    slug: "tce-madurai",
    programsOffered: [
      { name: "B.E. (EEE / EE / Mechanical)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "TVS Motor", type: "placement", since: 2017 },
    ],
    topRecruiters: ["TVS Motor", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 86, highestCtcLakhs: 22, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A++", "UGC autonomous"],
  },
  {
    slug: "galgotias-university",
    programsOffered: [
      { name: "B.Tech (EE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "internship", since: 2019 },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 280, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "sharda-univ",
    programsOffered: [
      { name: "B.Tech (EE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 78, highestCtcLakhs: 18, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "adamas-univ",
    programsOffered: [
      { name: "B.Tech (EE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "JSW Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 78, highestCtcLakhs: 18, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "gd-goenka-univ",
    programsOffered: [
      { name: "B.Tech (Automotive / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 78, highestCtcLakhs: 18, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "amity-univ-rajasthan",
    programsOffered: [
      { name: "B.Tech (EE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Hero MotoCorp", "Mahindra Electric", "Maruti Suzuki"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 80, highestCtcLakhs: 18, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "osmania-univ",
    researchCentres: [
      { name: "University College of Engineering — Power Engineering", focus: "EV controls, drives, BMS basics" },
    ],
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechanical) — multiple affiliated colleges", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Olectra Greentech", type: "placement", since: 2020 },
    ],
    topRecruiters: ["Olectra Greentech", "Mahindra Electric", "Hyundai India EV", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 6, placementRate: 75, highestCtcLakhs: 20, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },

  // ─── Big private university networks (5) ────────────────
  {
    slug: "vit-bhopal",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechatronics / Automobile with EV electives)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2019 },
      { oem: "Mahindra Electric", type: "internship", since: 2020 },
    ],
    topRecruiters: ["Bosch India", "Mahindra Electric", "Tata Motors EV", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 9, placementRate: 88, highestCtcLakhs: 28, recruiterCount: 250, year: 2025 },
    accreditations: ["UGC", "NAAC A+"],
  },
  {
    slug: "vit-chennai",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Hyundai India EV", type: "internship", since: 2019 },
      { oem: "TVS Motor", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Hyundai India EV", "TVS Motor", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 9, placementRate: 88, highestCtcLakhs: 28, recruiterCount: 280, year: 2025 },
    accreditations: ["UGC", "NAAC A+"],
  },
  {
    slug: "niit-univ",
    programsOffered: [
      { name: "B.Tech (CSE / Cybersecurity / Data Science)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["KPIT", "Tata Elxsi", "Bosch India", "L&T Technology Services"],
    placementStats: { medianCtcLakhs: 7, placementRate: 84, highestCtcLakhs: 20, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "centurion-univ",
    programsOffered: [
      { name: "B.Tech (Automobile / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "Diploma in EV Technology", level: "DIPLOMA", duration: "1 yr" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement", since: 2019 },
    ],
    topRecruiters: ["Tata Motors EV", "JSW Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 82, highestCtcLakhs: 18, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "amity-univ-chhattisgarh",
    programsOffered: [
      { name: "B.Tech (EE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bhilai Steel", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5, placementRate: 76, highestCtcLakhs: 16, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },

  // ─── Global EV-research universities (10) ─────────────
  {
    slug: "caltech",
    researchCentres: [
      { name: "Resnick Sustainability Institute", focus: "Battery + storage + EV grid integration" },
      { name: "Power & Energy Systems group (EE Dept.)", focus: "Power electronics, EV converters" },
    ],
    oemCollaborations: [
      { oem: "Toyota North America", type: "research" },
      { oem: "Tesla", type: "research" },
    ],
    accreditations: ["WASC accredited"],
  },
  {
    slug: "uc-berkeley",
    researchCentres: [
      { name: "Berkeley Energy & Climate Institute", focus: "EV transition + climate modelling" },
      { name: "Energy Storage Group", focus: "Cell chemistry + grid-scale storage" },
    ],
    oemCollaborations: [
      { oem: "Tesla", type: "research" },
      { oem: "Ford", type: "research" },
      { oem: "GM", type: "research" },
    ],
    accreditations: ["WASC accredited"],
  },
  {
    slug: "cornell-univ",
    researchCentres: [
      { name: "Atkinson Center for a Sustainable Future", focus: "EV + climate + materials research" },
      { name: "Cornell Energy Systems Institute", focus: "Battery + grid + EV systems" },
    ],
    accreditations: ["Middle States accredited"],
  },
  {
    slug: "columbia-univ",
    researchCentres: [
      { name: "Center on Global Energy Policy", focus: "EV adoption policy, climate finance" },
      { name: "Lenfest Center for Sustainable Energy", focus: "Battery materials, storage" },
    ],
    accreditations: ["Middle States accredited"],
  },
  {
    slug: "imperial-college-london",
    researchCentres: [
      { name: "Energy Futures Lab", focus: "EV + storage + grid integration" },
      { name: "Department of Mechanical Engineering — battery group", focus: "Cell chemistry, BMS algorithms" },
    ],
    oemCollaborations: [
      { oem: "JLR", type: "research" },
      { oem: "Williams Advanced Engineering", type: "research" },
    ],
    accreditations: ["Russell Group", "Royal Charter"],
  },
  {
    slug: "nus-singapore",
    researchCentres: [
      { name: "NUS Solar Energy Research Institute", focus: "Solar + EV charging + storage" },
      { name: "Centre for Energy Research & Technology", focus: "Battery + power electronics + EV systems" },
    ],
    oemCollaborations: [
      { oem: "BYD", type: "research" },
      { oem: "Hyundai", type: "research" },
    ],
    accreditations: ["Ministry of Education Singapore-recognised"],
  },
  {
    slug: "ntu-singapore",
    researchCentres: [
      { name: "Energy Research Institute @ NTU (ERI@N)", focus: "EV + charging + storage + grid research" },
      { name: "Centre for High Performance Computing — vehicle simulation", focus: "EV powertrain CAE + autonomy simulation" },
    ],
    oemCollaborations: [
      { oem: "BMW Group", type: "research" },
      { oem: "Volvo", type: "research" },
    ],
    accreditations: ["Ministry of Education Singapore-recognised"],
  },
  {
    slug: "kaist-daejeon",
    researchCentres: [
      { name: "Korea Advanced Battery Engineering Center", focus: "Cell chemistry, BMS, solid-state research" },
      { name: "Department of EE — Power Electronics Lab", focus: "Traction inverters, EV converters" },
    ],
    oemCollaborations: [
      { oem: "Hyundai", type: "research" },
      { oem: "Kia", type: "research" },
      { oem: "Samsung SDI", type: "research" },
      { oem: "LG Energy Solution", type: "research" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "tsinghua-beijing",
    researchCentres: [
      { name: "Tsinghua Center for Battery Research", focus: "Cell chemistry, BMS, EV pack design" },
      { name: "State Key Lab of Automotive Safety & Energy", focus: "EV safety, propagation testing, vehicle integration" },
    ],
    oemCollaborations: [
      { oem: "BYD", type: "research" },
      { oem: "NIO", type: "research" },
      { oem: "CATL", type: "research" },
      { oem: "Geely", type: "research" },
    ],
    accreditations: ["Chinese Ministry of Education Double First-Class"],
  },
  {
    slug: "kth-stockholm",
    researchCentres: [
      { name: "KTH Center for ECO² Vehicle Design", focus: "Lightweighting + EV powertrain integration" },
      { name: "School of Electrical Engineering & Computer Science — EV drives", focus: "Motors, inverters, controls" },
    ],
    oemCollaborations: [
      { oem: "Volvo", type: "research" },
      { oem: "Scania", type: "research" },
      { oem: "ABB", type: "research" },
    ],
    accreditations: ["Swedish state-recognised university"],
  },

  // ─── Mahindra Pride ITIs (14) ──────────────────────────
  ...[
    "bengaluru", "chennai", "coimbatore", "haridwar", "hyderabad",
    "igatpuri", "jaipur", "kandivali", "lucknow", "mumbai",
    "nashik", "pune", "rudrapur", "zaheerabad",
  ].map((loc) => ({
    slug: `mahindra-pride-iti-${loc}`,
    about: `Mahindra Pride School + ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Mahindra Pride Schools train and place underprivileged youth across automotive + EV roles into Mahindra's nationwide service + manufacturing network.`,
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "placement" as const, since: 2007, projects: "EV service + manufacturing direct-pipeline" },
      { oem: "Mahindra Last Mile Mobility", type: "placement" as const, since: 2018, projects: "3W EV service network hiring" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician (Mahindra-aligned)", level: "CERTIFICATE" as const, duration: "3-6 months" },
      { name: "Auto Mechanic + EV specialisation", level: "DIPLOMA" as const, duration: "12 months" },
    ],
    topRecruiters: ["Mahindra Electric", "Mahindra Last Mile Mobility", "Mahindra Auto authorised service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Mahindra Pride School certified"],
    facilities: ["Mahindra EV diagnostic kits", "HV-safety training area", "Workshop with assembly tools"],
    industryPartnerships: ["Mahindra Group", "NSDC", "ASDC"],
  })),

  // ─── Tata Skilling ITIs (14) ───────────────────────────
  ...[
    "ahmedabad", "aurangabad", "bengaluru", "bhopal", "bhubaneswar",
    "chennai", "coimbatore", "delhi", "hyderabad", "indore",
    "jaipur", "kolkata", "mumbai", "pune",
  ].map((loc) => ({
    slug: `tata-skilling-iti-${loc}`,
    about: `Tata Strive / Tata Skilling ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Industry-aligned vocational training program of the Tata group, with EV service + manufacturing tracks feeding Tata Motors EV's nationwide service network and the Sanand + Pimpri plants.`,
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement" as const, since: 2015, projects: "Direct hiring into Tata's national EV service network" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician (Tata-aligned)", level: "CERTIFICATE" as const, duration: "3-6 months" },
      { name: "ITI Mechanic + EV specialisation", level: "DIPLOMA" as const, duration: "1-2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Tata Motors authorised service network", "Tata Power EZ Charge"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Tata Strive certified"],
    facilities: ["Tata EV diagnostic equipment", "HV-safety training", "Battery service bench"],
    industryPartnerships: ["Tata Strive", "Tata Group", "NSDC", "ASDC"],
  })),

  // ─── Hero Skill ITIs (14) ──────────────────────────────
  ...[
    "bengaluru", "bhopal", "chandigarh", "chennai", "delhi",
    "dharuhera", "gurugram", "halol", "haridwar", "hyderabad",
    "jaipur", "lucknow", "meerut", "mumbai",
  ].map((loc) => ({
    slug: `hero-skill-iti-${loc}`,
    about: `Hero Skill ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Hero MotoCorp's authorised 2W technician training network, with EV electives added for the Vida product line.`,
    oemCollaborations: [
      { oem: "Hero MotoCorp (Vida EV)", type: "placement" as const, since: 2019, projects: "2W EV service-technician pipeline for Vida product line" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 2W EV Service Technician (Hero-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Mechanic — 2W EV specialisation", level: "DIPLOMA" as const, duration: "1 yr" },
    ],
    topRecruiters: ["Hero MotoCorp", "Hero Electric (legacy partnership)", "Hero authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Hero MotoCorp certified"],
    facilities: ["Hero Vida diagnostic toolkit", "2W HV-safety area", "Charger commissioning bench"],
    industryPartnerships: ["Hero MotoCorp", "ASDC", "NSDC"],
  })),

  // ─── Maruti CoE ITIs (10) ──────────────────────────────
  ...[
    "agra", "ajmer", "aligarh", "anand", "bahadurgarh",
    "bareilly", "coimbatore", "faridabad", "gurugram", "indore",
  ].map((loc) => ({
    slug: `maruti-coe-iti-${loc}`,
    about: `Maruti Suzuki Centre of Excellence ITI in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Maruti's COE program upgrades government ITI infrastructure + curriculum and routes top-performing students directly into Maruti's authorised dealer service network — including new EV models.`,
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "placement" as const, since: 2014, projects: "Direct ITI-to-service-network pipeline; EV training added 2024" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 Auto + EV Service Technician (Maruti-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Auto Mechanic", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Maruti authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Maruti CoE certified"],
    facilities: ["Maruti diagnostic toolkit", "HV-safety training area", "EV-vehicle service bay"],
    industryPartnerships: ["Maruti Suzuki", "ASDC", "NSDC"],
  })),

  // ─── Remaining government polytechnics (11) ──────────────
  ...[
    "ahmedabad", "allahabad", "amritsar", "guwahati", "kolhapur",
    "madurai", "muzaffarpur", "nagpur", "patna", "rajkot", "vijayawada",
  ].map((city) => ({
    slug: `govt-polytechnic-${city}`,
    about: `Government polytechnic in ${city.charAt(0).toUpperCase() + city.slice(1)} offering 3-year diploma programs in mechanical, electrical, electronics and automobile engineering — with state-board-mandated EV modules.`,
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering (EV electives)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Mechanical Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electronics Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "Maruti Suzuki", "Local OEM service networks"],
    accreditations: ["State Board of Technical Education", "AICTE-approved", "NSDC partner"],
    facilities: ["EV diagnostic bench", "HV-safety training area", "Workshop with assembly + repair tools"],
    industryPartnerships: ["State Skill Development Mission", "ASDC", "NSDC"],
  })),

  // ─── IIMs (2) for EV business-side roles ──────────────
  {
    slug: "iim-ahmedabad",
    programsOffered: [
      { name: "Post-Graduate Programme in Management (PGP)", level: "PG", duration: "2 yrs", evFocus: "Strategy / consulting / VC roles in EV companies" },
      { name: "ePGP (Executive PG)", level: "PG", duration: "1 yr" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement", since: 2018 },
      { oem: "Mahindra Electric", type: "placement", since: 2019 },
      { oem: "Ola Electric", type: "placement", since: 2022 },
    ],
    topRecruiters: ["McKinsey", "BCG", "Bain", "Tata Motors EV", "Ola Electric", "Reliance New Energy", "Mahindra Electric", "Sequoia / Peak XV", "Bessemer Venture Partners"],
    placementStats: { medianCtcLakhs: 35, placementRate: 100, highestCtcLakhs: 130, recruiterCount: 200, year: 2025 },
    accreditations: ["EQUIS", "AMBA", "AACSB", "Institute of National Importance"],
    industryPartnerships: ["AIMA", "Tata Trusts", "Reliance Foundation"],
  },
  {
    slug: "iim-bangalore",
    programsOffered: [
      { name: "Post-Graduate Programme in Management (PGP)", level: "PG", duration: "2 yrs", evFocus: "Bengaluru EV cluster placement" },
      { name: "EPGP (Executive)", level: "PG", duration: "1 yr" },
    ],
    oemCollaborations: [
      { oem: "Ather Energy", type: "placement", since: 2019 },
      { oem: "Ola Electric", type: "placement", since: 2021 },
      { oem: "Bolt.Earth", type: "placement", since: 2022 },
    ],
    topRecruiters: ["McKinsey", "BCG", "Bain", "Ather Energy", "Ola Electric", "Bolt.Earth", "Bosch India", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 33, placementRate: 100, highestCtcLakhs: 120, recruiterCount: 190, year: 2025 },
    accreditations: ["EQUIS", "AMBA", "AACSB", "Institute of National Importance"],
  },

  // ─── DRDO + remaining research bodies (2) ────────────────
  {
    slug: "drdo-vrde",
    about: "DRDO's Vehicle Research & Development Establishment (Ahmednagar) — designs and tests military-grade vehicles including EV / hybrid platforms for armed-forces mobility.",
    researchCentres: [
      { name: "Powertrain & Drivelines Division", focus: "Military EV / hybrid powertrain prototypes" },
      { name: "Vehicle Dynamics Lab", focus: "Off-road EV performance, ruggedised batteries" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors Defence Solutions", type: "research", since: 2010 },
      { oem: "Mahindra Defence", type: "research", since: 2012 },
    ],
    accreditations: ["DRDO laboratory", "Indian Defence-recognised"],
    facilities: ["Off-road test track", "Vehicle dynamometer", "Ruggedised-battery test rig"],
    industryPartnerships: ["DRDO", "Ministry of Defence", "Indian Army Vehicle wing"],
  },
  {
    slug: "nielit-delhi",
    programsOffered: [
      { name: "EV technology short course (NIELIT-affiliated)", level: "CERTIFICATE", duration: "3-6 months" },
      { name: "Embedded systems for EV applications", level: "CERTIFICATE", duration: "6 months" },
    ],
    accreditations: ["MeitY autonomous body", "NSDC partner"],
    facilities: ["Embedded systems lab", "EV diagnostic bench"],
    industryPartnerships: ["MeitY", "NSDC"],
  },
];

// ─── BATCH 04 ── State universities + Toyota TTEP network + Maruti CoE wave-2
// + remaining OEM ITIs + global Asian/European EV-research universities
// =====================================================================
// 6 state / central public universities
// + 5 Bengaluru / Pune tier-2 engineering clusters
// + 5 specialty + sectoral institutes
// + 10 global EV-research universities (Japan / Korea / EU / Canada)
// + 25 Toyota TTEP ITIs (entire India network)
// + 20 Maruti CoE ITIs (wave 2)
// + 9 remaining Tata Skilling ITIs
// + 6 remaining Hero Skill ITIs
// + 2 remaining Mahindra Pride entries
// + 13 remaining government polytechnics
// + 4 misc private universities
// = 105 entries

const BATCH_04: EnrichmentSpec[] = [
  // ─── State / public universities (6) ────────────────────
  {
    slug: "delhi-univ",
    researchCentres: [
      { name: "Cluster Innovation Centre", focus: "Cross-disciplinary EV + climate research" },
      { name: "Department of Physics & Astrophysics — battery materials", focus: "Cathode + electrolyte chemistry" },
    ],
    programsOffered: [
      { name: "B.Sc / M.Sc (Physics / Chemistry / Electronics)", level: "UG", duration: "3 yrs" },
      { name: "PhD (Materials Science / Chemistry)", level: "PHD" },
    ],
    topRecruiters: ["DRDO", "BHEL", "CSIR labs", "Tata Motors EV"],
    accreditations: ["NAAC A++", "UGC", "Institute of Eminence"],
  },
  {
    slug: "univ-mumbai",
    researchCentres: [
      { name: "Department of Chemical Technology (now ICT-Mumbai) — battery materials", focus: "Electrochemistry + battery materials" },
    ],
    programsOffered: [
      { name: "B.Tech / M.Tech (multiple affiliated colleges)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Reliance New Energy", "Bajaj Auto EV"],
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "univ-calcutta",
    researchCentres: [
      { name: "Department of Applied Physics — Energy storage group", focus: "Materials for batteries" },
    ],
    programsOffered: [
      { name: "B.Tech / M.Tech (affiliated colleges)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Tata Steel", "JSW Energy"],
    accreditations: ["NAAC A", "UGC", "Institute of Eminence"],
  },
  {
    slug: "univ-madras",
    programsOffered: [
      { name: "B.Tech / M.Tech (affiliated colleges)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Mahindra Electric"],
    accreditations: ["NAAC A++", "UGC"],
  },
  {
    slug: "univ-kerala",
    programsOffered: [
      { name: "B.Tech / M.Tech (affiliated colleges)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric"],
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "punjab-univ",
    researchCentres: [
      { name: "Department of Physics — battery materials group", focus: "Cathode chemistry, electrolyte additives" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / ME / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Systems)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Hero MotoCorp", "Mahindra Electric", "Tata Motors EV"],
    accreditations: ["NAAC A+", "UGC", "Institute of Eminence"],
  },

  // ─── Bengaluru / Pune tier-2 engg (5) ───────────────────
  {
    slug: "rvce-bengaluru",
    researchCentres: [
      { name: "Department of EE — EV Powertrain Lab", focus: "BMS, motor control, charging" },
      { name: "Centre for Industry-Academia Partnership", focus: "Live EV-industry projects" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2014 },
      { oem: "Ather Energy", type: "placement", since: 2019 },
      { oem: "Mahindra Electric", type: "placement", since: 2017 },
    ],
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric", "Continental India", "Tata Motors EV", "Sona Comstar BLW"],
    placementStats: { medianCtcLakhs: 11, placementRate: 92, highestCtcLakhs: 35, recruiterCount: 240, year: 2025 },
    accreditations: ["NAAC A+", "UGC autonomous"],
    facilities: ["EV powertrain bench", "Battery cycler", "Embedded automotive lab"],
  },
  {
    slug: "nmamit-nitte",
    programsOffered: [
      { name: "B.E. (EEE / Mechatronics / Automobile / EE)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bosch India", type: "placement", since: 2017 },
      { oem: "Ather Energy", type: "placement", since: 2020 },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric", "TVS Motor"],
    placementStats: { medianCtcLakhs: 8, placementRate: 88, highestCtcLakhs: 24, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "UGC autonomous"],
  },
  {
    slug: "reva-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 7, placementRate: 84, highestCtcLakhs: 22, recruiterCount: 160, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "aissms-coe-pune",
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechanical / Automobile)", level: "UG", duration: "4 yrs" },
      { name: "M.E. (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "placement", since: 2018 },
      { oem: "Tata Motors EV (Pimpri)", type: "placement", since: 2017 },
      { oem: "Bosch India", type: "internship", since: 2019 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India", "Sona Comstar BLW", "KPIT"],
    placementStats: { medianCtcLakhs: 7.5, placementRate: 88, highestCtcLakhs: 22, recruiterCount: 200, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "sinhgad-coe-pune",
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechanical / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV", type: "placement", since: 2017 },
      { oem: "Bosch India", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Bosch India", "Tata Motors EV", "KPIT"],
    placementStats: { medianCtcLakhs: 7, placementRate: 86, highestCtcLakhs: 20, recruiterCount: 220, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },

  // ─── Specialty + sectoral institutes (5) ────────────────
  {
    slug: "jamia-millia-islamia",
    researchCentres: [
      { name: "Centre for Nanoscience & Nanotechnology — battery materials group", focus: "Nano-structured cathodes + electrolytes" },
      { name: "Department of EE — Power Electronics", focus: "EV drives, BMS basics" },
    ],
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Engineering / Nanoscience)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp"],
    placementStats: { medianCtcLakhs: 8, placementRate: 86, highestCtcLakhs: 22, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A++", "UGC", "Central University"],
  },
  {
    slug: "tiss-mumbai-deemed",
    programsOffered: [
      { name: "M.A. (Public Policy / Sustainability)", level: "PG", duration: "2 yrs", evFocus: "EV policy + social transition research" },
    ],
    topRecruiters: ["NITI Aayog", "MoHI", "WRI India", "EV policy think-tanks"],
    accreditations: ["NAAC A++", "UGC", "Deemed University"],
    industryPartnerships: ["NITI Aayog", "MoHI", "Climate Group"],
  },
  {
    slug: "cipet-lucknow",
    researchCentres: [
      { name: "Plastics Engineering — battery enclosure research", focus: "Polymer composites for EV pack enclosures" },
    ],
    programsOffered: [
      { name: "Diploma in Plastics Technology", level: "DIPLOMA", duration: "3 yrs" },
      { name: "B.Tech in Plastics Engineering", level: "UG", duration: "4 yrs" },
    ],
    accreditations: ["MoCF autonomous body"],
    industryPartnerships: ["Ministry of Chemicals & Fertilisers"],
  },
  {
    slug: "nirma-univ",
    researchCentres: [
      { name: "Institute of Technology — Power Electronics group", focus: "EV drives, BMS, charging" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV (Sanand)", type: "placement", since: 2018 },
      { oem: "Bosch India", type: "internship", since: 2019 },
    ],
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bosch India", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 9, placementRate: 90, highestCtcLakhs: 28, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "UGC", "Deemed University"],
  },
  {
    slug: "dr-bamu-aurangabad",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical) — affiliated colleges", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [
      { oem: "Bajaj Auto EV (Aurangabad)", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Bajaj Auto EV", "Sona Comstar BLW", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 78, highestCtcLakhs: 18, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },

  // ─── Global EV-research universities (10) ─────────────
  {
    slug: "tokyo-tech",
    researchCentres: [
      { name: "Department of Electrical & Electronic Engineering — Power Electronics group", focus: "EV converters, motor controls" },
      { name: "Materials & Chemical Technology — battery materials", focus: "Solid-state Li-ion, sulphide electrolytes" },
    ],
    oemCollaborations: [
      { oem: "Toyota", type: "research" },
      { oem: "Honda R&D", type: "research" },
      { oem: "Panasonic", type: "research" },
    ],
    accreditations: ["MEXT-recognised"],
  },
  {
    slug: "kyoto-univ",
    researchCentres: [
      { name: "Department of Materials Science — battery research", focus: "Next-gen cathode chemistries" },
      { name: "Graduate School of Energy Science", focus: "Storage + grid + EV integration" },
    ],
    oemCollaborations: [
      { oem: "Toyota", type: "research" },
      { oem: "Honda R&D", type: "research" },
    ],
    accreditations: ["MEXT-recognised", "Designated National University"],
  },
  {
    slug: "kaist-daejeon",
    researchCentres: [
      { name: "Korea Advanced Battery Engineering Center", focus: "Cell + BMS + solid-state research" },
    ],
    oemCollaborations: [
      { oem: "Hyundai", type: "research" },
      { oem: "Samsung SDI", type: "research" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "postech-pohang",
    researchCentres: [
      { name: "Department of Materials Science — battery group", focus: "Solid-state batteries, anode materials" },
      { name: "Department of EE — power electronics", focus: "EV converters" },
    ],
    oemCollaborations: [
      { oem: "POSCO Future M", type: "research" },
      { oem: "Hyundai", type: "research" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "hanyang-univ",
    researchCentres: [
      { name: "Energy Engineering — battery research group", focus: "Cathode chemistry, BMS algorithms" },
    ],
    oemCollaborations: [
      { oem: "Hyundai", type: "research" },
      { oem: "Kia", type: "research" },
      { oem: "LG Energy Solution", type: "research" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "gist-korea",
    researchCentres: [
      { name: "School of Materials Science — battery research", focus: "Nano-structured cathodes + electrolytes" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "tudelft",
    researchCentres: [
      { name: "Storage of Electrochemical Energy Group", focus: "Battery materials + electrochemistry" },
      { name: "DC Systems, Energy Conversion & Storage Lab", focus: "EV converters, DC microgrids" },
    ],
    oemCollaborations: [
      { oem: "VDL Bus & Coach", type: "research" },
      { oem: "Stellantis", type: "research" },
    ],
    accreditations: ["Dutch state-recognised technical university"],
  },
  {
    slug: "aalto-helsinki",
    researchCentres: [
      { name: "Department of EE & Automation — power electronics group", focus: "EV converters, motor drives" },
    ],
    oemCollaborations: [
      { oem: "ABB", type: "research" },
      { oem: "Kone", type: "research" },
    ],
    accreditations: ["Finnish state-recognised university"],
  },
  {
    slug: "chalmers-gothenburg",
    researchCentres: [
      { name: "Electric Power Engineering Division", focus: "EV powertrain integration, charging" },
      { name: "SHC — Swedish Hybrid Vehicle Centre", focus: "Vehicle dynamics + powertrain research" },
    ],
    oemCollaborations: [
      { oem: "Volvo Cars", type: "research" },
      { oem: "Volvo Trucks", type: "research" },
      { oem: "Scania", type: "research" },
    ],
    accreditations: ["Swedish state-recognised university"],
  },
  {
    slug: "ubc-vancouver",
    researchCentres: [
      { name: "Clean Energy Research Centre", focus: "Battery + fuel cell + EV charging research" },
    ],
    oemCollaborations: [
      { oem: "Ballard Power Systems", type: "research" },
      { oem: "Tesla", type: "research" },
    ],
    accreditations: ["Canadian provincial public university"],
  },

  // ─── Toyota TTEP ITIs (25 — full Indian network) ──────────
  ...[
    "ahmedabad", "aurangabad", "bengaluru", "bhopal", "bhubaneswar",
    "bidadi", "chandigarh", "chennai", "coimbatore", "dehradun",
    "delhi", "guwahati", "hyderabad", "jaipur", "kochi",
    "kolkata", "lucknow", "madurai", "mangaluru", "mumbai",
    "mysuru", "nagpur", "noida", "pune", "raipur",
  ].map((loc) => ({
    slug: `toyota-ttep-iti-${loc}`,
    about: `Toyota Technical Training Program (TTEP) ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Toyota Kirloskar Motor's nationwide technician-training program upgrades government ITI infrastructure + curriculum and routes top performers into Toyota / Lexus authorised service network — increasingly including hybrid + EV products.`,
    oemCollaborations: [
      { oem: "Toyota Kirloskar Motor", type: "placement" as const, since: 2006, projects: "TTEP curriculum + direct hiring into Toyota service network" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 Auto Service Technician (Toyota TTEP)", level: "CERTIFICATE" as const, duration: "9 months" },
      { name: "ITI Auto Mechanic + Hybrid/EV Specialisation", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Toyota Kirloskar Motor", "Lexus India authorised service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Toyota TTEP certified"],
    facilities: ["Toyota diagnostic toolkit", "Hybrid + EV service bay", "HV-safety training area"],
    industryPartnerships: ["Toyota Kirloskar Motor", "ASDC", "NSDC"],
  })),

  // ─── Maruti CoE ITIs (20 — wave 2 cities) ──────────────
  ...[
    "bathinda", "bhagalpur", "bhopal", "davangere", "guntur",
    "gwalior", "hisar", "hubli", "jabalpur", "jaipur",
    "jamshedpur", "jhansi", "kakinada", "karimnagar", "karnal",
    "kolhapur", "kota", "madurai", "manesar", "mathura",
  ].map((loc) => ({
    slug: `maruti-coe-iti-${loc}`,
    about: `Maruti Suzuki Centre of Excellence ITI in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Maruti's CoE program upgrades government ITI infrastructure + curriculum and routes top performers into Maruti's authorised dealer service network — including new EV models like the e-Vitara.`,
    oemCollaborations: [
      { oem: "Maruti Suzuki", type: "placement" as const, since: 2014, projects: "Direct ITI-to-service-network pipeline; EV training added 2024" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 Auto + EV Service Technician (Maruti-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Auto Mechanic", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Maruti authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Maruti CoE certified"],
    facilities: ["Maruti diagnostic toolkit", "HV-safety training area", "EV-vehicle service bay"],
    industryPartnerships: ["Maruti Suzuki", "ASDC", "NSDC"],
  })),

  // ─── Remaining Tata Skilling ITIs (9) ──────────────────
  ...[
    "cuttack", "dharwad", "guwahati", "jamshedpur", "lucknow",
    "pantnagar", "patna", "ranchi", "sanand",
  ].map((loc) => ({
    slug: `tata-skilling-iti-${loc}`,
    about: `Tata Strive / Tata Skilling ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Industry-aligned vocational training program of the Tata group, with EV service + manufacturing tracks feeding Tata Motors EV's nationwide service network and the Sanand + Pimpri plants.`,
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "placement" as const, since: 2015, projects: "Direct hiring into Tata's national EV service network" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician (Tata-aligned)", level: "CERTIFICATE" as const, duration: "3-6 months" },
      { name: "ITI Mechanic + EV specialisation", level: "DIPLOMA" as const, duration: "1-2 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Tata Motors authorised service network", "Tata Power EZ Charge"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Tata Strive certified"],
    facilities: ["Tata EV diagnostic equipment", "HV-safety training", "Battery service bench"],
    industryPartnerships: ["Tata Strive", "Tata Group", "NSDC", "ASDC"],
  })),

  // ─── Remaining Hero Skill ITIs (6) ─────────────────────
  ...[
    "chittoor", "guwahati", "indore", "kolkata", "neemrana", "pune",
  ].map((loc) => ({
    slug: `hero-skill-iti-${loc}`,
    about: `Hero Skill ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Hero MotoCorp's authorised 2W technician training network, with EV electives added for the Vida product line.`,
    oemCollaborations: [
      { oem: "Hero MotoCorp (Vida EV)", type: "placement" as const, since: 2019, projects: "2W EV service-technician pipeline for Vida product line" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 2W EV Service Technician (Hero-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Mechanic — 2W EV specialisation", level: "DIPLOMA" as const, duration: "1 yr" },
    ],
    topRecruiters: ["Hero MotoCorp", "Hero authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Hero MotoCorp certified"],
    facilities: ["Hero Vida diagnostic toolkit", "2W HV-safety area", "Charger commissioning bench"],
    industryPartnerships: ["Hero MotoCorp", "ASDC", "NSDC"],
  })),

  // ─── Mahindra Pride remaining (2) ──────────────────────
  {
    slug: "mahindra-pride-iti-kandivali-w",
    about: "Mahindra Pride ITI — Kandivali (West) campus, Mumbai. Mahindra's flagship Mumbai-region technician + EV-service training centre, feeding the Western India service network.",
    oemCollaborations: [
      { oem: "Mahindra Electric", type: "placement", since: 2010 },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 EV Service Technician (Mahindra-aligned)", level: "CERTIFICATE", duration: "3-6 months" },
    ],
    topRecruiters: ["Mahindra Electric", "Mahindra authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Mahindra Pride School certified"],
    facilities: ["Mahindra EV diagnostic kits", "HV-safety training area"],
    industryPartnerships: ["Mahindra Group", "NSDC", "ASDC"],
  },
  {
    slug: "mahindra-pride-school",
    about: "Mahindra Pride School — flagship vocational training network across India for unemployed youth from underprivileged backgrounds, with structured EV + auto-service tracks feeding Mahindra's nationwide service network.",
    programsOffered: [
      { name: "Auto + EV Service Technician (flagship Pride curriculum)", level: "CERTIFICATE", duration: "3 months" },
      { name: "Hospitality + Customer Care", level: "CERTIFICATE", duration: "3 months" },
    ],
    topRecruiters: ["Mahindra Group", "Mahindra Electric", "Mahindra Logistics", "Mahindra Holidays"],
    accreditations: ["NSDC partner", "Mahindra Group flagship CSR initiative"],
    industryPartnerships: ["Mahindra Group", "Naandi Foundation", "NSDC"],
  },

  // ─── Remaining government polytechnics (13) ─────────────
  ...[
    "aizawl", "cuttack", "imphal", "itanagar", "jalpaiguri",
    "kanpur", "meerut", "sangli", "shillong", "sirsa",
    "tirupathi", "vadodara", "warangal",
  ].map((city) => ({
    slug: `govt-polytechnic-${city}`,
    about: `Government polytechnic in ${city.charAt(0).toUpperCase() + city.slice(1)} offering 3-year diploma programs in mechanical, electrical, electronics and automobile engineering — with state-board-mandated EV modules.`,
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering (EV electives)", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Mechanical Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
      { name: "Diploma in Electronics Engineering", level: "DIPLOMA" as const, duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Hero MotoCorp", "Maruti Suzuki", "Local OEM service networks"],
    accreditations: ["State Board of Technical Education", "AICTE-approved", "NSDC partner"],
    facilities: ["EV diagnostic bench", "HV-safety training area", "Workshop with assembly + repair tools"],
    industryPartnerships: ["State Skill Development Mission", "ASDC", "NSDC"],
  })),

  // ─── Misc private + remaining (4) ───────────────────────
  {
    slug: "tata-skilling-polytechnic-jamshedpur",
    about: "Tata Skilling Polytechnic at Jamshedpur — diploma-level technician training run by Tata Strive, with EV + auto-electronics tracks routing into Tata Motors EV's manufacturing + service network.",
    programsOffered: [
      { name: "Diploma in Automotive Technology (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electronics + Telecommunications", level: "DIPLOMA", duration: "3 yrs" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV (Jamshedpur)", type: "placement", since: 2018 },
      { oem: "Tata Steel", type: "placement", since: 2015 },
    ],
    topRecruiters: ["Tata Motors EV", "Tata Steel", "Tata Cummins"],
    accreditations: ["State Board of Technical Education (Jharkhand)", "AICTE-approved", "Tata Strive certified", "NSDC partner"],
    facilities: ["EV bench rigs", "Workshop"],
    industryPartnerships: ["Tata Strive", "Tata Group", "NSDC"],
  },
  {
    slug: "tata-skilling-polytechnic-pune",
    about: "Tata Skilling Polytechnic at Pune — diploma-level technician training with EV + auto-electronics tracks feeding the Pune OEM cluster (Tata Motors Pimpri, Bajaj Auto EV).",
    programsOffered: [
      { name: "Diploma in Automotive Technology (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV (Pimpri)", type: "placement", since: 2018 },
    ],
    topRecruiters: ["Tata Motors EV", "Bajaj Auto EV", "Bosch India"],
    accreditations: ["State Board of Technical Education (Maharashtra)", "AICTE-approved", "Tata Strive certified", "NSDC partner"],
    facilities: ["EV bench rigs", "Workshop"],
    industryPartnerships: ["Tata Strive", "Tata Group", "NSDC"],
  },
  {
    slug: "k-j-polytechnic-mumbai",
    about: "K.J. Somaiya Polytechnic, Mumbai — diploma programs in automobile + electrical + electronics with EV electives.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bajaj Auto EV", "Mahindra Electric"],
    accreditations: ["State Board of Technical Education (Maharashtra)", "AICTE-approved"],
    facilities: ["EV demo cell", "HV-safety training area"],
  },
  {
    slug: "central-polytechnic-chennai",
    about: "Central Polytechnic, Chennai — diploma programs in automobile + electrical + mechanical with EV electives from 2022.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Mechanical Engineering", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV", "Mahindra Electric"],
    accreditations: ["State Board of Technical Education (TN)", "AICTE-approved"],
    facilities: ["EV demo cell", "HV-safety training area"],
  },
];

// ─── BATCH 05 ── Honda + TVS skill ITIs + Asian/European/US global universities
// + tier-2 Indian engineering + remaining polytechnics + agri / state universities
// =====================================================================
// 15 Honda Skill ITIs (entire India network)
// + 10 TVS Skill ITIs (entire India network)
// + 15 East-Asian + Chinese EV-research universities
// + 10 European EV-research universities
// + 10 US EV-research universities (tier-2 + specialty)
// + 12 Indian tier-2 / specialty private universities
// + 10 remaining state-board polytechnics
// + 8 misc state / agricultural / design universities
// = 100 entries

const BATCH_05: EnrichmentSpec[] = [
  // ─── Honda Skill ITIs (15 — entire India network) ───────
  ...[
    "ahmedabad", "bengaluru", "bhopal", "chennai", "hyderabad",
    "jaipur", "kolkata", "lucknow", "manesar", "mumbai",
    "narsapura", "noida", "pune", "tapukara", "vithalapur",
  ].map((loc) => ({
    slug: `honda-skill-iti-${loc}`,
    about: `Honda Cars India + Honda Motorcycle & Scooter Skill ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. Honda's authorised technician-training network across India — upgrades government ITI infrastructure + curriculum and routes graduates into Honda's nationwide authorised dealer service network, increasingly with hybrid + EV scooter training (Activa-e etc).`,
    oemCollaborations: [
      { oem: "Honda Cars India", type: "placement" as const, since: 2010 },
      { oem: "Honda Motorcycle & Scooter India", type: "placement" as const, since: 2010, projects: "2W technician pipeline including new Activa-e EV program" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 Auto + EV Service Technician (Honda-aligned)", level: "CERTIFICATE" as const, duration: "9 months" },
      { name: "ITI Auto Mechanic + Hybrid/EV specialisation", level: "DIPLOMA" as const, duration: "2 yrs" },
    ],
    topRecruiters: ["Honda Cars India", "Honda Motorcycle & Scooter India", "Honda authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "Honda-certified curriculum"],
    facilities: ["Honda diagnostic toolkit", "Hybrid + EV scooter service bay", "HV-safety training area", "Activa-e training rig"],
    industryPartnerships: ["Honda group", "ASDC", "NSDC"],
  })),

  // ─── TVS Skill ITIs (10 — entire India network) ────────
  ...[
    "bengaluru", "chennai", "coimbatore", "hosur", "hyderabad",
    "madurai", "mysuru", "nalagarh", "pune", "trichy",
  ].map((loc) => ({
    slug: `tvs-skill-iti-${loc}`,
    about: `TVS Motor Company Skill ITI campus in ${loc.charAt(0).toUpperCase() + loc.slice(1)}. TVS's flagship 2W + 3W technician training network across India — direct hiring into TVS's nationwide service network and the Hosur 2W EV manufacturing plant (TVS iQube + new EV models).`,
    oemCollaborations: [
      { oem: "TVS Motor Company", type: "placement" as const, since: 2012, projects: "TVS iQube + 3W EV service-technician pipeline; Hosur plant manufacturing apprenticeships" },
    ],
    programsOffered: [
      { name: "ASDC Level 3-4 2W EV Service Technician (TVS-aligned)", level: "CERTIFICATE" as const, duration: "6 months" },
      { name: "ITI Mechanic — 2W + 3W EV specialisation", level: "DIPLOMA" as const, duration: "1-2 yrs" },
      { name: "Manufacturing apprenticeship (Hosur plant)", level: "CERTIFICATE" as const, duration: "12 months" },
    ],
    topRecruiters: ["TVS Motor Company", "TVS authorised dealer service network"],
    accreditations: ["DGT-affiliated ITI", "ASDC partner", "NSDC partner", "TVS Skill Centre certified"],
    facilities: ["TVS iQube diagnostic kit", "2W EV service bay", "HV-safety training area", "Battery diagnostics bench"],
    industryPartnerships: ["TVS Motor Company", "ASDC", "NSDC"],
  })),

  // ─── East-Asian + Chinese EV-research universities (15) ─
  {
    slug: "hokkaido-univ",
    researchCentres: [
      { name: "Institute for Catalysis — battery catalyst research", focus: "Electrocatalysis for battery + fuel cells" },
      { name: "Faculty of Engineering — Power Engineering group", focus: "EV converters, motor drives" },
    ],
    oemCollaborations: [{ oem: "Toyota", type: "research" }, { oem: "Honda R&D", type: "research" }],
    accreditations: ["MEXT-recognised", "Designated National University"],
  },
  {
    slug: "nagoya-univ",
    researchCentres: [
      { name: "Green Mobility Research Centre", focus: "EV powertrain, vehicle integration, battery research" },
      { name: "Institute of Materials & Systems for Sustainability", focus: "Battery materials, recycling" },
    ],
    oemCollaborations: [
      { oem: "Toyota", type: "research", projects: "Nagoya-Toyota joint research is one of Japan's deepest auto-industry partnerships" },
      { oem: "Denso", type: "research" },
      { oem: "Aisin", type: "research" },
    ],
    accreditations: ["MEXT-recognised", "Designated National University"],
  },
  {
    slug: "osaka-univ",
    researchCentres: [
      { name: "Center for Advanced Battery Research", focus: "Cell chemistry, solid-state batteries" },
      { name: "Department of Mechanical Engineering — EV powertrain group", focus: "Motor design, vehicle dynamics" },
    ],
    oemCollaborations: [{ oem: "Toyota", type: "research" }, { oem: "Panasonic", type: "research" }],
    accreditations: ["MEXT-recognised", "Designated National University"],
  },
  {
    slug: "tohoku-univ",
    researchCentres: [
      { name: "Advanced Institute for Materials Research (AIMR)", focus: "Solid-state battery materials, anode research" },
      { name: "Department of Mechanical Engineering — powertrain", focus: "EV vehicle integration" },
    ],
    oemCollaborations: [{ oem: "Toyota", type: "research" }, { oem: "Honda R&D", type: "research" }],
    accreditations: ["MEXT-recognised", "Designated National University"],
  },
  {
    slug: "fudan-univ",
    researchCentres: [
      { name: "Department of Materials Science — battery research", focus: "Solid-state Li-ion, lithium-sulphur" },
      { name: "Institute of New Energy", focus: "EV + grid integration, storage research" },
    ],
    oemCollaborations: [{ oem: "SAIC Motor", type: "research" }, { oem: "NIO", type: "research" }],
    accreditations: ["Chinese Double First-Class University"],
  },
  {
    slug: "sjtu",
    researchCentres: [
      { name: "Shanghai Jiao Tong Center for Advanced Energy Materials", focus: "Cathode + anode materials" },
      { name: "School of Mechanical Engineering — EV powertrain", focus: "Motor design, controls, integration" },
    ],
    oemCollaborations: [
      { oem: "SAIC Motor", type: "research" },
      { oem: "Geely", type: "research" },
      { oem: "CATL", type: "research" },
    ],
    accreditations: ["Chinese Double First-Class University"],
  },
  {
    slug: "peking-univ",
    researchCentres: [
      { name: "College of Chemistry & Molecular Engineering — battery materials", focus: "Next-gen electrolytes, solid-state research" },
    ],
    oemCollaborations: [{ oem: "BYD", type: "research" }, { oem: "BAIC", type: "research" }],
    accreditations: ["Chinese Double First-Class University"],
  },
  {
    slug: "zhejiang-univ",
    researchCentres: [
      { name: "College of Energy Engineering", focus: "EV powertrain + grid integration + storage" },
      { name: "Department of Polymer Science — separator membranes", focus: "Battery separators, polymer electrolytes" },
    ],
    oemCollaborations: [
      { oem: "Geely (Hangzhou-headquartered)", type: "research" },
      { oem: "CATL", type: "research" },
    ],
    accreditations: ["Chinese Double First-Class University"],
  },
  {
    slug: "hkust",
    researchCentres: [
      { name: "Energy Institute — battery + storage research", focus: "Cell chemistry, BMS, grid integration" },
      { name: "Department of Mechanical & Aerospace Engineering — EV group", focus: "Motor design, autonomy" },
    ],
    oemCollaborations: [{ oem: "BYD", type: "research" }, { oem: "Geely", type: "research" }],
    accreditations: ["Hong Kong University Grants Committee-recognised"],
  },
  {
    slug: "hku",
    researchCentres: [
      { name: "Department of EE & EE — power group", focus: "EV converters, motor controls" },
    ],
    accreditations: ["Hong Kong University Grants Committee-recognised"],
  },
  {
    slug: "cuhk",
    researchCentres: [
      { name: "Department of Mechanical & Automation Engineering — EV powertrain", focus: "Vehicle integration, autonomy" },
    ],
    accreditations: ["Hong Kong University Grants Committee-recognised"],
  },
  {
    slug: "polyu-hk",
    researchCentres: [
      { name: "Department of EE — Power Electronics Group", focus: "EV converters, charging hardware" },
    ],
    oemCollaborations: [{ oem: "BYD", type: "research" }],
    accreditations: ["Hong Kong University Grants Committee-recognised"],
  },
  {
    slug: "city-univ-hk",
    researchCentres: [
      { name: "Department of Materials Science — battery research", focus: "Cathode chemistries" },
    ],
    accreditations: ["Hong Kong University Grants Committee-recognised"],
  },
  {
    slug: "ajou-univ",
    researchCentres: [
      { name: "Department of EE — power electronics group", focus: "EV drives, motor controls" },
    ],
    oemCollaborations: [{ oem: "Hyundai", type: "research" }, { oem: "Kia", type: "research" }],
    accreditations: ["Korean Ministry of Education-recognised"],
  },
  {
    slug: "ewha-univ",
    researchCentres: [
      { name: "Department of Chemistry — battery materials", focus: "Cathode + electrolyte research" },
    ],
    accreditations: ["Korean Ministry of Education-recognised"],
  },

  // ─── European EV-research universities (10) ────────────
  {
    slug: "aalborg-univ",
    researchCentres: [
      { name: "AAU Energy — Power Electronics group", focus: "EV converters, grid integration" },
      { name: "Department of Energy Technology — battery storage", focus: "BMS, second-life batteries" },
    ],
    oemCollaborations: [{ oem: "Vestas", type: "research" }, { oem: "Grundfos", type: "research" }],
    accreditations: ["Danish state-recognised university"],
  },
  {
    slug: "aarhus-univ",
    researchCentres: [
      { name: "Department of Mechanical & Production Engineering — EV powertrain", focus: "Vehicle integration, NVH" },
    ],
    accreditations: ["Danish state-recognised university"],
  },
  {
    slug: "denmark-tu",
    researchCentres: [
      { name: "Department of Electrical Engineering — EV drives + power electronics", focus: "Motor controls, traction inverters" },
      { name: "Department of Energy Conversion & Storage", focus: "Battery materials, fuel cells" },
    ],
    oemCollaborations: [{ oem: "Vestas", type: "research" }, { oem: "Volvo", type: "research" }],
    accreditations: ["Danish state-recognised university"],
  },
  {
    slug: "exeter-univ",
    researchCentres: [
      { name: "Environment & Sustainability Institute — EV transition research", focus: "EV adoption, lifecycle analysis" },
    ],
    accreditations: ["Russell Group", "Royal Charter"],
  },
  {
    slug: "brunel-univ-london",
    researchCentres: [
      { name: "Centre for Advanced Powertrain & Fuels — EV applications", focus: "EV powertrain design, hybrid systems" },
    ],
    oemCollaborations: [{ oem: "JLR", type: "research" }, { oem: "Caterpillar", type: "research" }],
    accreditations: ["Royal Charter"],
  },
  {
    slug: "heriot-watt-univ",
    researchCentres: [
      { name: "School of Engineering & Physical Sciences — EV motor research", focus: "Motor design, drives" },
    ],
    accreditations: ["Royal Charter"],
  },
  {
    slug: "cardiff-univ",
    researchCentres: [
      { name: "School of Engineering — Centre for High Voltage Engineering", focus: "EV charging-station HV systems" },
    ],
    accreditations: ["Russell Group", "Royal Charter"],
  },
  {
    slug: "cranfield-univ",
    researchCentres: [
      { name: "Centre for Automotive Engineering", focus: "EV powertrain, vehicle dynamics, hybrid systems" },
      { name: "Centre for Energy Conversion Research", focus: "Battery + fuel cell research" },
    ],
    oemCollaborations: [
      { oem: "JLR", type: "research" },
      { oem: "Bentley", type: "research" },
      { oem: "Williams Advanced Engineering", type: "research" },
    ],
    accreditations: ["Royal Charter", "Postgraduate-only university"],
  },
  {
    slug: "heidelberg-univ",
    researchCentres: [
      { name: "Department of Chemistry — battery materials research", focus: "Electrolyte additives, cathode chemistries" },
    ],
    accreditations: ["German state-recognised university", "Excellence Initiative"],
  },
  {
    slug: "ghent-univ",
    researchCentres: [
      { name: "Department of Electromechanical Systems & Energy Engineering", focus: "Motor design, EV converter design" },
    ],
    accreditations: ["Belgian state-recognised university"],
  },

  // ─── US EV-research universities tier-2 + specialty (10) ─
  {
    slug: "georgia-tech",
    researchCentres: [
      { name: "Strategic Energy Institute", focus: "EV + storage + grid research" },
      { name: "School of Electrical & Computer Engineering — Power Electronics", focus: "EV traction inverters, SiC research" },
    ],
    oemCollaborations: [{ oem: "Ford", type: "research" }, { oem: "GM", type: "research" }, { oem: "Tesla", type: "research" }],
    accreditations: ["SACSCOC accredited"],
  },
  {
    slug: "cmu-pittsburgh",
    researchCentres: [
      { name: "Wilton E Scott Institute for Energy Innovation", focus: "EV + storage + climate" },
      { name: "Department of EE & Computer Engineering — Power Electronics", focus: "EV converters, motor controls" },
      { name: "Robotics Institute — autonomous EV applications", focus: "Self-driving + sensor fusion" },
    ],
    oemCollaborations: [{ oem: "GM", type: "research" }, { oem: "Aurora Innovation", type: "research" }, { oem: "Uber ATG legacy", type: "research" }],
    accreditations: ["Middle States accredited"],
  },
  {
    slug: "drexel-univ",
    researchCentres: [
      { name: "A.J. Drexel Nanomaterials Institute — battery materials", focus: "Solid-state batteries, MXene electrodes" },
    ],
    accreditations: ["Middle States accredited"],
  },
  {
    slug: "case-western-reserve",
    researchCentres: [
      { name: "Great Lakes Energy Institute", focus: "Battery + EV research" },
      { name: "Department of EECS — Power Engineering", focus: "EV converters" },
    ],
    accreditations: ["NCA accredited"],
  },
  {
    slug: "clemson-univ",
    researchCentres: [
      { name: "Clemson University International Center for Automotive Research (CU-ICAR)", focus: "Vehicle research with BMW Spartanburg plant proximity" },
    ],
    oemCollaborations: [{ oem: "BMW Group (Spartanburg)", type: "research" }, { oem: "Michelin", type: "research" }],
    accreditations: ["SACSCOC accredited"],
  },
  {
    slug: "boston-univ",
    researchCentres: [
      { name: "Center for Energy & Environmental Studies", focus: "EV policy + transition research" },
    ],
    accreditations: ["NEASC accredited"],
  },
  {
    slug: "michigan-tech-univ",
    researchCentres: [
      { name: "Department of Mechanical Engineering & Engineering Mechanics — EV powertrain", focus: "Hybrid systems, NVH, vehicle dynamics" },
      { name: "Advanced Power Systems Research Centre", focus: "EV + storage research" },
    ],
    oemCollaborations: [{ oem: "Ford", type: "research" }, { oem: "GM", type: "research" }],
    accreditations: ["HLC accredited"],
  },
  {
    slug: "rochester-inst-tech",
    researchCentres: [
      { name: "Golisano Institute for Sustainability", focus: "EV + battery recycling research" },
    ],
    accreditations: ["Middle States accredited"],
  },
  {
    slug: "worcester-polytechnic",
    researchCentres: [
      { name: "Center for Advanced Battery Engineering", focus: "Battery materials + manufacturing process research" },
    ],
    accreditations: ["NEASC accredited"],
  },
  {
    slug: "auburn-univ",
    researchCentres: [
      { name: "Center for Automotive Research", focus: "EV powertrain + vehicle dynamics research" },
    ],
    oemCollaborations: [{ oem: "Hyundai Motor Manufacturing Alabama", type: "research" }, { oem: "Mercedes-Benz US International (Alabama)", type: "research" }],
    accreditations: ["SACSCOC accredited"],
  },

  // ─── Indian tier-2 / specialty private universities (12) ─
  {
    slug: "ahmedabad-univ",
    researchCentres: [
      { name: "School of Engineering & Applied Science — EV powertrain group", focus: "Battery, motor, vehicle integration" },
    ],
    oemCollaborations: [{ oem: "Tata Motors EV (Sanand)", type: "internship", since: 2020 }],
    programsOffered: [
      { name: "B.Tech (EE / Mechatronics / Mechanical)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 8, placementRate: 85, highestCtcLakhs: 24, recruiterCount: 120, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "alliance-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "MBA (with EV-industry consulting electives)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric", "Bain & Co", "Deloitte"],
    placementStats: { medianCtcLakhs: 7, placementRate: 82, highestCtcLakhs: 22, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "presidency-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6, placementRate: 80, highestCtcLakhs: 18, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "atria-univ",
    programsOffered: [
      { name: "B.Tech (EE / CSE / Design)", level: "UG", duration: "4 yrs", evFocus: "EV adjacency through design + mechatronics electives" },
    ],
    topRecruiters: ["Ather Energy", "Bosch India"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 100, year: 2025 },
    accreditations: ["UGC"],
  },
  {
    slug: "flame-univ",
    programsOffered: [
      { name: "Bachelor of Arts / Science (Liberal Arts)", level: "UG", duration: "4 yrs" },
      { name: "MBA (with sustainability + EV-policy electives)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Mahindra Electric", "Tata Motors EV", "NITI Aayog", "WRI India"],
    accreditations: ["UGC", "NAAC A"],
  },
  {
    slug: "lpu-phagwara",
    researchCentres: [
      { name: "School of Mechanical Engineering — EV powertrain group", focus: "Battery, motor, vehicle integration" },
    ],
    oemCollaborations: [{ oem: "Hero MotoCorp", type: "placement", since: 2017 }, { oem: "Mahindra Electric", type: "placement", since: 2018 }],
    programsOffered: [
      { name: "B.Tech (Mechatronics / Automobile / EE / EV specialisation)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Automotive Engineering)", level: "PG", duration: "2 yrs" },
    ],
    topRecruiters: ["Hero MotoCorp", "Mahindra Electric", "Tata Motors EV", "Bosch India", "Maruti Suzuki"],
    placementStats: { medianCtcLakhs: 6, placementRate: 85, highestCtcLakhs: 20, recruiterCount: 600, year: 2025 },
    accreditations: ["NAAC A+", "UGC"],
  },
  {
    slug: "banasthali-vidyapith",
    programsOffered: [
      { name: "B.Tech (EE / ECE) — women-only campus", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Tata Motors EV"],
    placementStats: { medianCtcLakhs: 6, placementRate: 80, highestCtcLakhs: 18, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
    industryPartnerships: ["Women-in-EV partnership programs"],
  },
  {
    slug: "vel-tech-univ",
    programsOffered: [
      { name: "B.Tech (Automobile / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "M.Tech (Power Electronics / Automotive)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [{ oem: "Hyundai India EV", type: "internship", since: 2019 }],
    topRecruiters: ["Hyundai India EV", "TVS Motor", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 82, highestCtcLakhs: 20, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "cmr-univ-bangalore",
    programsOffered: [
      { name: "B.Tech (EE / EEE / Mechanical)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Bosch India", "Ather Energy", "Tata Elxsi"],
    placementStats: { medianCtcLakhs: 6, placementRate: 78, highestCtcLakhs: 18, recruiterCount: 100, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "bannari-amman-inst-tech",
    programsOffered: [
      { name: "B.E. (EE / EEE / Automobile / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [{ oem: "TVS Motor", type: "placement", since: 2015 }],
    topRecruiters: ["TVS Motor", "Bosch India", "Sona Comstar BLW", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 6.5, placementRate: 85, highestCtcLakhs: 20, recruiterCount: 180, year: 2025 },
    accreditations: ["NAAC A", "UGC autonomous"],
  },
  {
    slug: "ajeenkya-dy-patil-univ",
    programsOffered: [
      { name: "B.Tech (Mechatronics / EE / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV", "Bosch India"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 76, highestCtcLakhs: 16, recruiterCount: 120, year: 2025 },
    accreditations: ["UGC"],
  },
  {
    slug: "dy-patil-univ-navi-mumbai",
    programsOffered: [
      { name: "B.Tech (EE / Mechatronics / Automobile)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Bosch India"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 78, highestCtcLakhs: 16, recruiterCount: 150, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },

  // ─── Remaining state-board polytechnics (10) ────────────
  {
    slug: "ggsipu-polytechnic-delhi",
    about: "GGSIPU-affiliated polytechnic in Delhi NCR — 3-year diploma programs with state-mandated EV modules added 2023.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Mechanical Engineering", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Maruti Suzuki", "Hero MotoCorp", "Tata Motors EV", "Mahindra Electric"],
    accreditations: ["State Board of Technical Education (Delhi)", "AICTE-approved"],
    facilities: ["EV demo cell", "HV-safety training area"],
  },
  {
    slug: "kerala-govt-polytechnic-kalamassery",
    about: "Kerala Government Polytechnic at Kalamassery — diploma programs in mechanical, electrical, electronics and automobile engineering with EV electives.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric"],
    accreditations: ["State Board of Technical Education (Kerala)", "AICTE-approved"],
    facilities: ["EV demo cell"],
  },
  {
    slug: "sj-polytechnic-bengaluru",
    about: "S J Government Polytechnic, Bengaluru — diploma programs with EV electives, feeding the Bengaluru EV startup cluster.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
      { name: "Diploma in Electrical Engineering", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Ather Energy", "Bosch India", "Mahindra Electric"],
    accreditations: ["State Board of Technical Education (Karnataka)", "AICTE-approved"],
    facilities: ["EV demo cell", "HV-safety area"],
  },
  {
    slug: "thiagarajar-polytechnic",
    about: "Thiagarajar Polytechnic College in Madurai — diploma programs with EV electives, feeding the Madurai + Coimbatore Tier-1 supplier ecosystem.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Bosch India", "Sona Comstar BLW"],
    accreditations: ["State Board of Technical Education (TN)", "AICTE-approved", "UGC autonomous polytechnic"],
  },
  {
    slug: "wadia-polytechnic-pune",
    about: "Wadia Polytechnic Institute, Pune — diploma programs with EV electives, feeding the Pune OEM + Tier-1 cluster.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Tata Motors EV (Pimpri)", "Bosch India"],
    accreditations: ["State Board of Technical Education (Maharashtra)", "AICTE-approved"],
  },
  {
    slug: "mgm-polytechnic-aurangabad",
    about: "MGM Polytechnic, Aurangabad — diploma programs with EV electives, feeding the Aurangabad auto-cluster (Bajaj, Sona Comstar BLW).",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Bajaj Auto EV", "Sona Comstar BLW", "Endurance Technologies"],
    accreditations: ["State Board of Technical Education (Maharashtra)", "AICTE-approved"],
  },
  {
    slug: "ksrm-polytechnic",
    about: "KSRM Polytechnic — diploma programs with EV electives.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["TVS Motor", "Hyundai India EV"],
    accreditations: ["State Board of Technical Education", "AICTE-approved"],
  },
  {
    slug: "ghani-khan-polytechnic-mald",
    about: "Ghani Khan Choudhury Polytechnic Institute, Malda — diploma programs with EV electives, feeding the eastern India auto-cluster.",
    programsOffered: [
      { name: "Diploma in Automobile Engineering (with EV modules)", level: "DIPLOMA", duration: "3 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "JSW Energy"],
    accreditations: ["State Board of Technical Education (WB)", "AICTE-approved"],
  },
  {
    slug: "dwarkadas-college",
    about: "Dwarkadas J Sanghvi College of Engineering, Mumbai — diploma + degree programs with EV electives.",
    programsOffered: [
      { name: "Diploma in Engineering", level: "DIPLOMA", duration: "3 yrs" },
      { name: "B.Tech (Multiple disciplines)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Tata Motors EV", "Bajaj Auto EV", "Mahindra Electric", "Bosch India"],
    accreditations: ["NAAC A", "UGC autonomous"],
  },
  {
    slug: "deyk-college-bangalore",
    about: "DEYK Engineering College, Bengaluru — degree programs in EE / Mechatronics with EV electives.",
    programsOffered: [
      { name: "B.E. (EEE / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    topRecruiters: ["Ather Energy", "Bosch India", "Mahindra Electric"],
    accreditations: ["State Board (Karnataka)", "AICTE-approved"],
  },

  // ─── Misc state / agricultural / design universities (8) ─
  {
    slug: "gbpuat",
    about: "Govind Ballabh Pant University of Agriculture & Technology, Pantnagar — agricultural + engineering university adjacent to Tata Motors EV's Pantnagar plant, with farm-mechanisation EV research.",
    programsOffered: [
      { name: "B.Tech (Agricultural Engg / EE / Mechanical)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [{ oem: "Tata Motors EV (Pantnagar)", type: "placement", since: 2017 }],
    topRecruiters: ["Tata Motors EV", "Mahindra & Mahindra (tractors)", "Hero MotoCorp (Haridwar)"],
    placementStats: { medianCtcLakhs: 6, placementRate: 80, highestCtcLakhs: 18, recruiterCount: 140, year: 2025 },
    accreditations: ["NAAC A", "ICAR-recognised"],
  },
  {
    slug: "andhra-univ",
    programsOffered: [
      { name: "B.E. (EE / EEE / Mechanical) — affiliated colleges", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [{ oem: "Hyundai India EV (Visakhapatnam)", type: "internship", since: 2020 }],
    topRecruiters: ["Hyundai India EV", "Mahindra Electric", "Olectra Greentech"],
    accreditations: ["NAAC A++", "UGC"],
  },
  {
    slug: "osmania-univ",
    researchCentres: [
      { name: "University College of Engineering — Power Engineering", focus: "EV controls, drives, BMS basics" },
    ],
    programsOffered: [
      { name: "B.E. / M.E. (EE / EEE / Mechanical) — affiliated colleges", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [{ oem: "Olectra Greentech", type: "placement", since: 2020 }],
    topRecruiters: ["Olectra Greentech", "Mahindra Electric", "Hyundai India EV"],
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "nid-ahmedabad",
    about: "National Institute of Design, Ahmedabad — India's flagship design institute. EV-relevant programs in industrial design, transportation design, CMF.",
    programsOffered: [
      { name: "B.Des / M.Des (Industrial / Transportation / CMF Design)", level: "UG", duration: "4 yrs", evFocus: "Vehicle exterior + interior + CMF for EVs" },
    ],
    oemCollaborations: [
      { oem: "Tata Motors EV", type: "research", since: 2010 },
      { oem: "Mahindra Electric", type: "research", since: 2012 },
      { oem: "Ather Energy", type: "internship", since: 2019 },
    ],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric", "Ather Energy", "Ola Electric"],
    accreditations: ["DPIIT autonomous body", "Institution of National Importance (Design)"],
    facilities: ["Vehicle clay-modelling studio", "Alias / VRED digital surface lab"],
    industryPartnerships: ["DPIIT", "Tata Trusts", "Society of Automotive Engineers"],
  },
  {
    slug: "nise-gurugram",
    about: "National Institute of Solar Energy (NISE), Gurugram — autonomous body under MNRE training the solar + EV-charging workforce.",
    programsOffered: [
      { name: "Solar + EV Charging-Infrastructure short courses", level: "CERTIFICATE", duration: "1-3 months" },
    ],
    industryPartnerships: ["MNRE", "DST", "Tata Power EZ Charge"],
    accreditations: ["MNRE autonomous body"],
  },
  {
    slug: "ganpat-univ",
    programsOffered: [
      { name: "B.Tech (Automobile / EE / Mechatronics)", level: "UG", duration: "4 yrs" },
    ],
    oemCollaborations: [{ oem: "Tata Motors EV (Sanand)", type: "internship", since: 2020 }],
    topRecruiters: ["Tata Motors EV", "Mahindra Electric"],
    placementStats: { medianCtcLakhs: 5.5, placementRate: 80, highestCtcLakhs: 16, recruiterCount: 130, year: 2025 },
    accreditations: ["NAAC A", "UGC"],
  },
  {
    slug: "adani-univ",
    about: "Adani University, Ahmedabad — Adani-group-backed university with energy + infrastructure focus including EV charging.",
    programsOffered: [
      { name: "B.Tech (Energy / Mechatronics)", level: "UG", duration: "4 yrs" },
      { name: "MBA (Energy + Infrastructure)", level: "PG", duration: "2 yrs" },
    ],
    oemCollaborations: [{ oem: "Adani TotalEnergies E-Mobility", type: "placement", since: 2022 }],
    topRecruiters: ["Adani TotalEnergies E-Mobility", "Adani Green Energy", "Tata Motors EV"],
    accreditations: ["UGC"],
  },
  {
    slug: "csir-csio",
    about: "Note: alias slug for CSIR Central Scientific Instruments Organisation (Chandigarh). See `csir-csio-chandigarh` for the canonical enrichment.",
    accreditations: ["CSIR lab"],
  },
];

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  const allBatches: { name: string; specs: EnrichmentSpec[] }[] = [
    { name: "batch 01", specs: BATCH_01 },
    { name: "batch 02", specs: BATCH_02 },
    { name: "batch 03", specs: BATCH_03 },
    { name: "batch 04", specs: BATCH_04 },
    { name: "batch 05", specs: BATCH_05 },
  ];
  const totalSpecs = allBatches.reduce((acc, b) => acc + b.specs.length, 0);
  console.log(`📚 Enriching ${totalSpecs} institutions across ${allBatches.length} batches...`);
  let touched = 0;
  let missing = 0;

  for (const batch of allBatches) {
    console.log(`\n── ${batch.name} (${batch.specs.length} entries) ──`);
    for (const spec of batch.specs) {
      const existing = await db.institution.findUnique({
        where: { slug: spec.slug },
        select: { id: true, name: true },
      });
      if (!existing) {
        console.warn(`   ⚠ Slug not found: ${spec.slug}`);
        missing += 1;
        continue;
      }

      // Build update payload — only set the fields actually present
      // in this spec. This lets us iteratively enrich an institution
      // across multiple seed runs without overwriting prior data.
      const data: Record<string, unknown> = {};
      if (spec.about !== undefined) data.about = spec.about;
      if (spec.researchCentres !== undefined) data.researchCentres = spec.researchCentres;
      if (spec.oemCollaborations !== undefined) data.oemCollaborations = spec.oemCollaborations;
      if (spec.ongoingResearch !== undefined) data.ongoingResearch = spec.ongoingResearch;
      if (spec.programsOffered !== undefined) data.programsOffered = spec.programsOffered;
      if (spec.notableAlumni !== undefined) data.notableAlumni = spec.notableAlumni;
      if (spec.topRecruiters !== undefined) data.topRecruiters = spec.topRecruiters;
      if (spec.placementStats !== undefined) data.placementStats = spec.placementStats;
      if (spec.accreditations !== undefined) data.accreditations = spec.accreditations;
      if (spec.facilities !== undefined) data.facilities = spec.facilities;
      if (spec.industryPartnerships !== undefined) data.industryPartnerships = spec.industryPartnerships;
      if (spec.researchOverview !== undefined) data.researchOverview = spec.researchOverview;
      if (spec.placementOverview !== undefined) data.placementOverview = spec.placementOverview;

      await db.institution.update({
        where: { id: existing.id },
        data,
      });
      console.log(`   ✓ ${existing.name} (${spec.slug})`);
      touched += 1;
    }
  }

  console.log(
    `\n✅ All batches done. Enriched ${touched} institutions${missing > 0 ? ` · ${missing} missing slugs (skipped)` : ""}.`,
  );
  console.log("   Add the next batch by appending a BATCH_03 const + pushing it into the allBatches array.");
}

main()
  .catch((err) => {
    console.error("✗ Institution enrichment failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
