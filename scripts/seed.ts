/**
 * Master seed: EV domains, canonical skills, and a bootstrap admin user.
 * Run: pnpm db:seed
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const db = new PrismaClient();

const EV_DOMAINS = [
  { slug: "battery-tech", name: "Battery Tech", description: "Cell, pack, BMS, thermal & safety" },
  { slug: "charging-infra", name: "Charging Infrastructure", description: "AC/DC chargers, OCPP, CMS, deployment" },
  { slug: "powertrain", name: "Powertrain", description: "Drivetrain, gearbox, integration" },
  { slug: "motor-control", name: "Motor & Power Electronics", description: "Motors, inverters, controllers" },
  { slug: "vehicle-engineering", name: "Vehicle Engineering", description: "Chassis, body, EV-specific design" },
  { slug: "fleet-mobility", name: "Fleet & Mobility", description: "Fleet ops, telematics, EV-as-a-service" },
  { slug: "manufacturing", name: "EV Manufacturing", description: "Assembly, QA, supply chain" },
  { slug: "software-iot", name: "Software & IoT", description: "Embedded firmware, telematics, mobile apps" },
  { slug: "after-sales", name: "After-sales & Service", description: "Service centres, technicians, diagnostics" },
  { slug: "policy-research", name: "Policy & Research", description: "Regulatory, sustainability, R&D" },
];

const SKILLS_BY_DOMAIN: Record<string, string[]> = {
  "battery-tech": [
    "Lithium-ion Cells", "Battery Pack Design", "BMS", "Thermal Management",
    "Cell Chemistry", "Battery Testing", "Solid-state Batteries", "Pack Assembly",
    "Battery Safety", "Cell Balancing", "Battery Modeling", "AIS-156",
  ],
  "charging-infra": [
    "OCPP 1.6/2.0.1", "AC Charging", "DC Fast Charging", "CCS2", "CHAdeMO",
    "GB/T", "Charge Management System", "Site Surveying", "Bharat AC-001/DC-001",
    "Smart Charging", "V2G", "Load Balancing",
  ],
  "powertrain": [
    "Drivetrain Design", "Reduction Gearbox", "Powertrain Integration",
    "Vehicle Dynamics", "Driveshaft", "Differential",
  ],
  "motor-control": [
    "PMSM", "BLDC", "Induction Motor", "Motor Winding", "FOC",
    "Inverter Design", "Motor Controller", "SiC/GaN", "Power Electronics",
    "Vector Control", "DTC", "Regenerative Braking",
  ],
  "vehicle-engineering": [
    "CATIA", "SolidWorks", "ANSYS", "AutoCAD", "Vehicle Packaging",
    "Crash Simulation", "BIW", "Aerodynamics", "Sheet Metal Design",
  ],
  "fleet-mobility": [
    "Fleet Management", "Telematics", "Route Optimisation", "TCO Analysis",
    "EV Leasing", "Mobility-as-a-Service",
  ],
  "manufacturing": [
    "Assembly Line", "QA/QC", "Six Sigma", "Lean Manufacturing", "PPAP",
    "Supplier Management", "BOM", "ERP",
  ],
  "software-iot": [
    "Embedded C", "ARM Cortex", "AUTOSAR", "CAN Bus", "MQTT",
    "Android Auto", "Linux", "RTOS", "Telematics Stack", "OTA Updates",
    "MATLAB/Simulink",
  ],
  "after-sales": [
    "EV Diagnostics", "OBD", "High-voltage Safety", "Battery Servicing",
    "Service Manual", "Customer Service",
  ],
  "policy-research": [
    "FAME II/III", "PLI Scheme", "EV Policy", "LCA", "Sustainability",
    "Carbon Accounting", "Standards (BIS/ARAI)",
  ],
};

async function main() {
  console.log("🌱 Seeding EV domains...");
  for (let i = 0; i < EV_DOMAINS.length; i++) {
    const d = EV_DOMAINS[i];
    await db.eVDomain.upsert({
      where: { slug: d.slug },
      create: { ...d, order: i },
      update: { name: d.name, description: d.description, order: i },
    });
  }

  console.log("🌱 Seeding canonical EV skills...");
  for (const [domainSlug, skills] of Object.entries(SKILLS_BY_DOMAIN)) {
    const domain = await db.eVDomain.findUnique({ where: { slug: domainSlug } });
    if (!domain) continue;
    for (const name of skills) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      await db.skill.upsert({
        where: { slug },
        create: { slug, name, evDomainId: domain.id, category: domain.name },
        update: { name, evDomainId: domain.id, category: domain.name },
      });
    }
  }
  const skillCount = await db.skill.count();
  console.log(`   → ${skillCount} skills total`);

  console.log("🌱 Seeding bootstrap admin user...");
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@emobility.careers";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const passwordHash = await argon2.hash(adminPassword);
  await db.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: "Platform Admin",
      passwordHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
    update: { role: "ADMIN" },
  });
  console.log(`   → Admin: ${adminEmail} / ${adminPassword} (CHANGE ME)`);

  console.log("✅ Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
