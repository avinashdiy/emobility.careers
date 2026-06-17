/**
 * Career guides — long-form "how to become an X in India's EV industry"
 * content. The 4th SEO play: ev.care won on query-targeted depth pages;
 * these are the careers equivalent, capturing high-intent informational
 * searches ("how to become a battery engineer", "EV charging engineer
 * career") that the job board alone can't rank for.
 *
 * Each guide is hand-authored evergreen content (the prose is what earns
 * the ranking — no thin templating) but the detail page ALSO pulls LIVE
 * data at render time: the crowd-sourced salary median (Salary Compass),
 * the live open-jobs count, and cross-links to the matching
 * /salaries/[role] and /jobs/[domain] facet pages. So the page stays
 * fresh + internally linked without rewriting the content.
 *
 * salaryRoleSlug + domainSlug are verified against the live tables so
 * every cross-link resolves. Keep them in sync if those slugs change.
 */

export interface CareerGuideStep {
  title: string;
  detail: string;
}

export interface CareerGuideFaq {
  question: string;
  answer: string;
}

export interface CareerGuide {
  slug: string;
  /** Display role name, e.g. "Battery Engineer". */
  role: string;
  /** One-line label for cards + breadcrumbs. */
  tagline: string;
  /** Maps to /salaries/[slug] — verified against live SalaryCompass. */
  salaryRoleSlug: string;
  /** Maps to /jobs/[domain] — verified against live EVDomain. */
  domainSlug: string;
  domainName: string;
  /** Free-text query for /jobs?q= (the on-board search). */
  jobsQuery: string;
  metaTitle: string;
  metaDescription: string;
  /** 1–2 sentence hero summary. */
  summary: string;
  /** What the role is — 2 short paragraphs (overview). */
  overview: string[];
  /** Day-to-day responsibilities. */
  whatYouDo: string[];
  hardSkills: string[];
  softSkills: string[];
  qualifications: string[];
  /** Ordered "how to get in" steps. */
  steps: CareerGuideStep[];
  /** Career ladder, junior → senior. */
  careerPath: string[];
  /** Representative Indian EV employers hiring this role. */
  topEmployers: string[];
  faqs: CareerGuideFaq[];
}

export const CAREER_GUIDES: CareerGuide[] = [
  {
    slug: "battery-engineer",
    role: "Battery Engineer",
    tagline: "Design and validate the cells, modules and packs that power EVs",
    salaryRoleSlug: "battery-engineer",
    domainSlug: "battery-tech",
    domainName: "Battery Tech",
    jobsQuery: "battery engineer",
    metaTitle: "How to Become a Battery Engineer in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Step-by-step guide to becoming a battery engineer in India's EV industry — the degrees, skills, tools and salary you need, plus who's hiring. Live openings + median pay.",
    summary:
      "Battery engineers design, test and improve the lithium-ion cells, modules and packs at the heart of every electric vehicle — the single most in-demand specialism in India's EV sector.",
    overview: [
      "A battery engineer owns the energy-storage system: selecting cell chemistry, designing the pack's mechanical and thermal architecture, and validating performance, safety and life. It is the highest-leverage role in the EV stack because the battery is the most expensive, most safety-critical and most differentiating part of the vehicle.",
      "In India the demand is acute. Cell-manufacturing gigafactories, pack assemblers, two- and three-wheeler OEMs and energy-storage startups are all hiring, and the talent pool of engineers with real pack experience is still thin — which is exactly why pay and mobility in this role are strong.",
    ],
    whatYouDo: [
      "Select and benchmark cell chemistries (LFP, NMC) against cost, energy density, life and safety targets",
      "Design pack architecture — mechanical layout, busbars, thermal management and enclosure",
      "Run electrical, thermal and abuse testing (cycle life, capacity fade, thermal runaway propagation)",
      "Build and validate battery models and size packs for range, power and fast-charge targets",
      "Work with BMS engineers on cell balancing, SoC/SoH estimation and safety limits",
      "Drive compliance with AIS-156 / IS 17855 and other Indian and international battery-safety standards",
    ],
    hardSkills: [
      "Lithium-ion cell fundamentals & chemistry (LFP, NMC)",
      "Pack & module mechanical design (CAD — CATIA / SolidWorks)",
      "Thermal management & cooling design",
      "Battery testing equipment (cyclers, environmental chambers)",
      "Battery modelling & simulation (MATLAB/Simulink, Python)",
      "Safety standards: AIS-156, IS 17855, UN 38.3",
    ],
    softSkills: [
      "Data-driven problem solving",
      "Cross-functional collaboration (BMS, manufacturing, design)",
      "Rigour around safety & documentation",
      "Clear technical communication",
    ],
    qualifications: [
      "B.Tech/B.E. in Electrical, Mechanical, Chemical, Electronics or Materials Engineering",
      "M.Tech in energy storage / electrochemistry is a strong plus (not mandatory)",
      "Hands-on cell/pack project work, internships, or a dedicated EV-battery certification",
    ],
    steps: [
      {
        title: "Build the fundamentals",
        detail:
          "Get solid on electrochemistry basics, lithium-ion cell behaviour and heat transfer. A degree in electrical, mechanical, chemical or materials engineering is the usual entry point — but the specific battery knowledge you'll learn on top.",
      },
      {
        title: "Get hands-on with cells and packs",
        detail:
          "Theory isn't enough. Do a project, internship or certification where you actually build and test a pack — measure capacity, run cycle tests, design a simple thermal solution. Recruiters strongly prefer candidates who have touched real hardware.",
      },
      {
        title: "Learn the tools",
        detail:
          "Pick up CAD for mechanical pack design, MATLAB/Simulink or Python for battery modelling, and familiarity with battery cyclers and test chambers. Even basic fluency separates you from purely theoretical applicants.",
      },
      {
        title: "Master the safety standards",
        detail:
          "India's AIS-156 and IS 17855 govern EV battery safety. Knowing what they require — and why thermal-runaway propagation testing matters — signals you're ready for production work, not just prototypes.",
      },
      {
        title: "Target the right employers and apply",
        detail:
          "Cell manufacturers, pack assemblers and EV OEMs hire most battery engineers. Build a portfolio of your hardware projects, then apply to live openings and set up a profile so recruiters in this domain can find you.",
      },
    ],
    careerPath: [
      "Graduate / Trainee Battery Engineer",
      "Battery Engineer (cell or pack)",
      "Senior Battery Engineer",
      "Battery Pack / Cell Lead",
      "Battery Systems Manager / Head of Battery",
    ],
    topEmployers: [
      "Ola Electric",
      "Ather Energy",
      "Exponent Energy",
      "Log9 Materials",
      "Amara Raja",
      "Tata AutoComp",
    ],
    faqs: [
      {
        question: "Do I need a master's degree to become a battery engineer?",
        answer:
          "No. A bachelor's in electrical, mechanical, chemical or materials engineering plus genuine hands-on cell/pack experience is enough for most roles. A master's in energy storage or electrochemistry helps for R&D and cell-development positions but isn't required to start.",
      },
      {
        question: "Which engineering branch is best for battery engineering?",
        answer:
          "There's no single right branch. Electrical and electronics engineers tend toward BMS and electrical pack design; mechanical engineers toward pack structure and thermal design; chemical and materials engineers toward cell chemistry. All three routes lead into battery engineering.",
      },
      {
        question: "Is battery engineering a good career in India?",
        answer:
          "Yes — it's arguably the strongest EV specialism in India right now. Cell gigafactories, pack makers and OEMs are all scaling, the experienced-talent pool is small, and that supply-demand gap keeps both pay and job mobility high.",
      },
    ],
  },
  {
    slug: "bms-engineer",
    role: "BMS Engineer",
    tagline: "Build the brain that keeps every EV battery safe and efficient",
    salaryRoleSlug: "bms-engineer",
    domainSlug: "battery-tech",
    domainName: "Battery Tech",
    jobsQuery: "BMS engineer",
    metaTitle: "How to Become a BMS Engineer in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Become a Battery Management System (BMS) engineer in India's EV industry: the embedded, hardware and algorithm skills you need, qualifications, salary and who's hiring.",
    summary:
      "A BMS (Battery Management System) engineer designs the electronics and firmware that monitor, protect and balance an EV battery — the safety-critical brain that decides what the pack is allowed to do.",
    overview: [
      "The Battery Management System measures every cell's voltage, current and temperature, estimates state-of-charge and state-of-health, balances cells, and enforces safety limits. A BMS engineer works across hardware (sensing and protection circuits), embedded firmware, and estimation algorithms.",
      "Because the BMS is what stands between a normal pack and a thermal event, it's one of the most respected — and best-paid — roles in EV electronics. India's two-wheeler, three-wheeler and energy-storage boom has made experienced BMS engineers genuinely scarce.",
    ],
    whatYouDo: [
      "Design BMS hardware: cell-sensing, current measurement, contactor control and protection",
      "Write embedded firmware (C/C++ on ARM Cortex-M) for monitoring, balancing and fault handling",
      "Develop SoC / SoH estimation and cell-balancing algorithms",
      "Implement functional-safety and fault-diagnosis logic (over-voltage, over-temperature, isolation)",
      "Integrate the BMS with the vehicle over CAN and validate against the pack",
      "Test and certify against safety standards (AIS-156, ISO 26262 concepts)",
    ],
    hardSkills: [
      "Embedded C / C++ on microcontrollers (ARM Cortex-M)",
      "BMS hardware & analog front-end ICs",
      "CAN / communication protocols",
      "SoC/SoH estimation algorithms (Coulomb counting, Kalman filters)",
      "Battery fundamentals & cell balancing",
      "Functional safety (ISO 26262 awareness), AIS-156",
    ],
    softSkills: [
      "Debugging & systematic root-cause analysis",
      "Safety-first mindset",
      "Working across hardware/firmware/algorithm teams",
      "Documentation discipline",
    ],
    qualifications: [
      "B.Tech/B.E. in Electronics, Electrical, Instrumentation or Computer Engineering",
      "Strong embedded-systems foundation (microcontrollers, C)",
      "BMS / EV-electronics project, internship or certification",
    ],
    steps: [
      {
        title: "Get strong at embedded systems",
        detail:
          "BMS work is embedded-first. Learn C deeply, get comfortable on an ARM Cortex-M microcontroller, and understand interrupts, timers, ADCs and communication peripherals. This is the non-negotiable base.",
      },
      {
        title: "Learn battery behaviour",
        detail:
          "You can't manage what you don't understand. Study how lithium-ion cells charge, discharge, age and fail, and why balancing and accurate SoC matter. Pair the electronics with real battery knowledge.",
      },
      {
        title: "Master CAN and BMS hardware",
        detail:
          "Understand analog front-end ICs for cell sensing, contactor and pre-charge control, and CAN communication with the vehicle. Build a small BMS or read commercial BMS schematics to see how it fits together.",
      },
      {
        title: "Build estimation and safety logic",
        detail:
          "Implement SoC estimation (start with Coulomb counting, then a Kalman filter) and fault-handling state machines. Knowing functional-safety concepts (ISO 26262) and AIS-156 requirements sets you apart for production roles.",
      },
      {
        title: "Apply with a demonstrable project",
        detail:
          "A working BMS project — even a small balancing board with firmware — is the strongest possible signal. Showcase it, then apply to OEMs, BMS specialists and energy-storage companies, and make your profile findable by domain recruiters.",
      },
    ],
    careerPath: [
      "Graduate Embedded / BMS Engineer",
      "BMS Engineer (firmware or hardware)",
      "Senior BMS Engineer",
      "BMS Lead / Architect",
      "Battery Electronics Manager",
    ],
    topEmployers: [
      "Ather Energy",
      "Ola Electric",
      "Exponent Energy",
      "Matter",
      "ION Energy",
      "Bosch",
    ],
    faqs: [
      {
        question: "Is BMS engineering hardware or software?",
        answer:
          "Both. A BMS engineer typically works across hardware (sensing and protection circuits), embedded firmware (monitoring, balancing, fault handling) and algorithms (SoC/SoH estimation). Some specialise in firmware or hardware, but understanding all three is what makes you effective.",
      },
      {
        question: "What programming language is used for BMS?",
        answer:
          "Embedded C is the dominant language, usually on ARM Cortex-M microcontrollers, with some C++. Algorithm prototyping is often done in MATLAB/Simulink or Python before being ported to embedded C.",
      },
      {
        question: "How is a BMS engineer different from a battery engineer?",
        answer:
          "A battery engineer designs the physical pack — cells, structure and thermal management. A BMS engineer builds the electronics and firmware that monitor and protect that pack. They work closely together, and many engineers move between the two.",
      },
    ],
  },
  {
    slug: "ev-charging-infrastructure-engineer",
    role: "EV Charging Infrastructure Engineer",
    tagline: "Design and deploy the chargers and networks that keep EVs moving",
    salaryRoleSlug: "charging-infrastructure-engineer",
    domainSlug: "charging-infra",
    domainName: "Charging Infrastructure",
    jobsQuery: "charging infrastructure engineer",
    metaTitle: "How to Become an EV Charging Engineer in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Guide to becoming an EV charging infrastructure engineer in India: power-electronics, OCPP, site-design and electrical skills you need, qualifications, salary and who's hiring.",
    summary:
      "EV charging infrastructure engineers design, deploy and operate the AC and DC chargers — and the networks behind them — that make electric mobility practical at scale.",
    overview: [
      "This role spans the charger itself (power electronics that convert grid AC to the DC a battery needs), the site (electrical design, load management, safety and grid connection) and the network (OCPP communication, remote monitoring and uptime). Engineers may specialise in hardware, site deployment, or backend/network operations.",
      "India's public-charging build-out — backed by policy, fleet electrification and highway-corridor targets — has turned charging into one of the fastest-growing EV job families. It rewards engineers who can bridge power electronics, electrical safety and connected-software systems.",
    ],
    whatYouDo: [
      "Design AC/DC charging hardware or specify chargers for a site",
      "Plan site electrical layout — load, protection, earthing, grid connection",
      "Implement and test OCPP communication between chargers and the network backend",
      "Ensure safety and standards compliance (IEC 61851, CCS2 / connector standards, AIS-138)",
      "Commission stations and troubleshoot field faults",
      "Monitor network uptime, energy and utilisation, and improve reliability",
    ],
    hardSkills: [
      "Power electronics (AC-DC, DC-DC converters)",
      "Electrical design — load, protection, earthing",
      "OCPP & charger-to-cloud communication",
      "Charging standards: IEC 61851, CCS2, AIS-138",
      "Site planning & commissioning",
      "Basic networking / IoT for connected chargers",
    ],
    softSkills: [
      "Field problem-solving",
      "Vendor & utility coordination",
      "Safety and compliance discipline",
      "Clear documentation for deployment teams",
    ],
    qualifications: [
      "B.Tech/B.E. in Electrical, Electronics or Power Engineering",
      "Knowledge of power electronics and electrical safety",
      "EV-charging or power-systems project / certification",
    ],
    steps: [
      {
        title: "Ground yourself in electrical engineering",
        detail:
          "Charging is fundamentally an electrical-power discipline. Get solid on AC/DC power, electrical safety, protection and earthing — this is the foundation whether you go hardware, site or network.",
      },
      {
        title: "Learn power electronics",
        detail:
          "Understand how a charger converts grid AC to controlled DC: rectifiers, DC-DC stages, power factor correction and thermal design. Even at the site level, knowing what's inside the box makes you far more capable.",
      },
      {
        title: "Pick up OCPP and connected systems",
        detail:
          "Modern chargers talk to a cloud backend over OCPP for authentication, billing and monitoring. Learning OCPP and basic IoT/networking opens both the hardware and the backend-operations sides of the field.",
      },
      {
        title: "Know the standards and safety",
        detail:
          "IEC 61851, the CCS2 connector standard and India's AIS-138 govern charging. Combined with electrical-safety practice, this knowledge is what employers need before they put you on real deployments.",
      },
      {
        title: "Get field exposure and apply",
        detail:
          "Site surveys, commissioning and fault-finding experience are gold. Whether through a project, internship or junior role, get hands-on, then target CPOs (charge-point operators), charger OEMs and EV infrastructure startups.",
      },
    ],
    careerPath: [
      "Graduate / Charging Station Technician",
      "Charging Infrastructure Engineer",
      "Senior Charging Engineer / Site Manager",
      "Charging Network Operations Lead",
      "Head of Charging Infrastructure",
    ],
    topEmployers: [
      "Tata Power",
      "Statiq",
      "ChargeZone",
      "Exicom",
      "Numocity",
      "Ather Energy",
    ],
    faqs: [
      {
        question: "What is OCPP and why does it matter for charging engineers?",
        answer:
          "OCPP (Open Charge Point Protocol) is the open standard chargers use to talk to a management cloud — for authentication, billing, remote control and monitoring. It matters because almost every networked public charger uses it, so OCPP fluency is highly valued for both hardware and backend roles.",
      },
      {
        question: "Do I need a power-electronics background for EV charging?",
        answer:
          "For charger hardware design, yes — power electronics is central. For site deployment and network operations you need electrical-safety knowledge and OCPP/IoT skills more than deep power-electronics design, though understanding the fundamentals always helps.",
      },
      {
        question: "Is EV charging a growing field in India?",
        answer:
          "Strongly. India's public-charging network is expanding rapidly under policy targets, fleet electrification and highway-corridor programmes, making charging one of the fastest-growing EV career families.",
      },
    ],
  },
  {
    slug: "powertrain-engineer",
    role: "EV Powertrain Engineer",
    tagline: "Engineer the motor, controller and drivetrain that move the vehicle",
    salaryRoleSlug: "powertrain-engineer",
    domainSlug: "powertrain",
    domainName: "Powertrain",
    jobsQuery: "powertrain engineer",
    metaTitle: "How to Become an EV Powertrain Engineer in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Become an EV powertrain engineer in India: the motor, motor-control, power-electronics and integration skills you need, qualifications, salary and who's hiring. Live openings.",
    summary:
      "EV powertrain engineers design and integrate the electric drive system — motor, inverter/controller and transmission — that converts battery energy into motion, efficiency and performance.",
    overview: [
      "The powertrain is what makes an EV drive: the electric motor, the inverter/motor-controller that drives it, and the mechanical drivetrain that delivers torque to the wheels. A powertrain engineer optimises this system for efficiency, performance, thermal behaviour, cost and NVH (noise, vibration, harshness).",
      "As Indian OEMs move from imported drive units to in-house powertrains, demand for engineers who understand motors, power electronics and control together is rising fast. It's a role that blends electrical machines, control theory and mechanical integration.",
    ],
    whatYouDo: [
      "Select and size electric motors (PMSM, induction, BLDC) for performance targets",
      "Design or tune motor-controller / inverter behaviour and control strategies (FOC)",
      "Optimise drive-unit efficiency, thermal management and packaging",
      "Run powertrain simulation and validate against dyno and vehicle testing",
      "Address NVH and drivability in the drivetrain",
      "Integrate the powertrain with the battery, BMS and vehicle controls over CAN",
    ],
    hardSkills: [
      "Electric machines (PMSM, BLDC, induction motors)",
      "Motor control & power electronics (inverters, FOC)",
      "Control systems & MATLAB/Simulink",
      "Powertrain simulation & dyno testing",
      "Thermal management of drive units",
      "Vehicle integration & CAN",
    ],
    softSkills: [
      "Systems thinking across electrical + mechanical",
      "Test-and-iterate discipline",
      "Cross-team integration",
      "Trade-off analysis (cost vs performance vs efficiency)",
    ],
    qualifications: [
      "B.Tech/B.E. in Electrical, Mechanical, Mechatronics or Automotive Engineering",
      "Strong grounding in electric machines and/or control systems",
      "Powertrain, motor-control or EV project / internship",
    ],
    steps: [
      {
        title: "Choose your entry angle",
        detail:
          "Powertrain spans electrical machines, control and mechanical integration. Electrical engineers usually enter via motors and control; mechanical engineers via drivetrain, thermal and integration. Pick the angle that matches your degree and go deep there first.",
      },
      {
        title: "Learn motors and motor control",
        detail:
          "Understand how PMSM, BLDC and induction motors work, and how an inverter drives them using Field-Oriented Control (FOC). This electrical-machine-plus-control core is the heart of EV powertrain work.",
      },
      {
        title: "Get fluent in simulation",
        detail:
          "MATLAB/Simulink modelling of motors, controllers and full drive systems is standard. Build models, then correlate them with real dyno or vehicle data — that simulate-and-validate loop is the daily reality of the job.",
      },
      {
        title: "Understand integration and thermal",
        detail:
          "A drive unit has to fit, stay cool and talk to the rest of the vehicle. Learn packaging, thermal management and CAN-based integration with the battery and vehicle controls.",
      },
      {
        title: "Build a project and apply",
        detail:
          "A motor-control project, an FSAE/BAJA EV drivetrain, or a simulation study you can defend will stand out. Then target EV OEMs and drive-unit suppliers, and make your profile discoverable to powertrain recruiters.",
      },
    ],
    careerPath: [
      "Graduate Powertrain Engineer",
      "Powertrain / Motor-Control Engineer",
      "Senior Powertrain Engineer",
      "Powertrain Integration Lead",
      "Head of Powertrain / Drive Systems",
    ],
    topEmployers: [
      "Ola Electric",
      "Ather Energy",
      "TVS Motor",
      "Mahindra Electric",
      "Bajaj Auto",
      "Sona Comstar",
    ],
    faqs: [
      {
        question: "What's the difference between a powertrain engineer and a motor engineer?",
        answer:
          "A motor engineer focuses specifically on the electric machine — its electromagnetic design and performance. A powertrain engineer takes a system view across the motor, the controller/inverter and the drivetrain, and how they integrate into the vehicle. The motor is one part of the powertrain.",
      },
      {
        question: "Is FOC important for EV powertrain roles?",
        answer:
          "Yes. Field-Oriented Control is the dominant strategy for driving the PMSM and induction motors used in EVs. Understanding FOC — even conceptually — is a strong signal for motor-control and powertrain roles.",
      },
      {
        question: "Can a mechanical engineer work in EV powertrain?",
        answer:
          "Absolutely. Mechanical engineers contribute on drivetrain design, packaging, thermal management, NVH and vehicle integration. The powertrain is a genuinely multi-disciplinary system, so both electrical and mechanical engineers have clear paths in.",
      },
    ],
  },
  {
    slug: "ev-embedded-software-engineer",
    role: "EV Embedded Software Engineer",
    tagline: "Write the firmware that runs the motor, battery and connected vehicle",
    salaryRoleSlug: "embedded-software-engineer",
    domainSlug: "software-iot",
    domainName: "Software & IoT",
    jobsQuery: "embedded software engineer",
    metaTitle: "How to Become an EV Embedded Software Engineer in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Become an embedded software engineer in India's EV industry: the C/C++, RTOS, CAN and microcontroller skills you need, qualifications, salary and top employers. Live openings.",
    summary:
      "Embedded software engineers write the firmware that runs inside an EV's controllers — motor controller, BMS, VCU and telematics — making the hardware actually work, safely and reliably.",
    overview: [
      "Almost every function in a modern EV is governed by embedded software running on microcontrollers: the motor controller, the battery management system, the vehicle control unit (VCU) and the connected/telematics unit. Embedded software engineers build and validate this firmware in C/C++, often on an RTOS, communicating over CAN.",
      "As EVs become 'software-defined', this is one of the most transferable and fastest-growing roles in the industry — and India's strong software talent base means it's an accessible entry point for engineers who pair coding ability with hardware understanding.",
    ],
    whatYouDo: [
      "Write and test embedded C/C++ firmware for EV controllers (motor, BMS, VCU)",
      "Work with microcontrollers, peripherals (ADC, timers, PWM) and an RTOS",
      "Implement CAN / LIN / UDS communication and diagnostics",
      "Build control and safety logic and state machines",
      "Debug on hardware with oscilloscopes, debuggers and CAN tools",
      "Follow embedded best practices (MISRA-C, version control, CI for firmware)",
    ],
    hardSkills: [
      "Embedded C / C++",
      "Microcontrollers (ARM Cortex-M) & peripherals",
      "RTOS fundamentals",
      "CAN / LIN / UDS automotive protocols",
      "Debugging with scopes, JTAG, CAN analysers",
      "MISRA-C & functional-safety awareness (ISO 26262)",
    ],
    softSkills: [
      "Methodical debugging",
      "Attention to detail & reliability mindset",
      "Reading hardware datasheets",
      "Collaboration with hardware & systems teams",
    ],
    qualifications: [
      "B.Tech/B.E. in Electronics, Electrical, Computer Science or related",
      "Strong C programming and microcontroller fundamentals",
      "Embedded / EV firmware project, internship or certification",
    ],
    steps: [
      {
        title: "Master C and microcontrollers",
        detail:
          "Embedded work lives or dies on C and bare-metal microcontroller skills. Learn C deeply, then program an ARM Cortex-M board directly — GPIO, timers, interrupts, ADC, PWM, UART. Build things that blink, sense and move.",
      },
      {
        title: "Learn RTOS and embedded structure",
        detail:
          "Move from bare-metal to an RTOS (tasks, scheduling, synchronisation). Understand how production firmware is structured, and adopt version control and disciplined, testable code from the start.",
      },
      {
        title: "Pick up automotive communication",
        detail:
          "CAN is the backbone of vehicle networks; LIN and UDS (diagnostics) build on it. Learning these — and how to sniff and debug a CAN bus — is what makes you specifically an EV/automotive embedded engineer rather than a generic one.",
      },
      {
        title: "Understand the EV systems you'll code for",
        detail:
          "Know the basics of what a motor controller, BMS and VCU do. Software that controls safety-critical hardware demands you understand the hardware — and awareness of MISRA-C and ISO 26262 signals production-readiness.",
      },
      {
        title: "Ship a hardware project and apply",
        detail:
          "A firmware project on real hardware — motor control, a sensor node on CAN, a mini-BMS — is the strongest portfolio. Then target EV OEMs, Tier-1 suppliers and EV software startups, and keep your profile visible to recruiters.",
      },
    ],
    careerPath: [
      "Graduate Embedded Engineer",
      "Embedded Software Engineer",
      "Senior Embedded Engineer",
      "Embedded Lead / Firmware Architect",
      "Engineering Manager — Embedded / Software",
    ],
    topEmployers: [
      "Ather Energy",
      "Ola Electric",
      "Bosch",
      "KPIT",
      "Tata Elxsi",
      "Continental",
    ],
    faqs: [
      {
        question: "Which language should I learn for EV embedded software?",
        answer:
          "Embedded C is essential, with C++ increasingly common. Python is useful for tooling, automation and test scripts. Master C and microcontroller fundamentals first — everything else builds on that.",
      },
      {
        question: "Do I need an electronics degree, or can a CS graduate do embedded EV work?",
        answer:
          "Computer-science graduates can absolutely enter embedded EV roles, provided they learn microcontrollers, hardware fundamentals and automotive protocols like CAN. An electronics or electrical background gives a head start on the hardware side, but strong C and systems skills matter more than the exact branch.",
      },
      {
        question: "Why is CAN important for EV software engineers?",
        answer:
          "CAN (Controller Area Network) is the standard bus that EV controllers use to talk to each other — motor controller, BMS, VCU and more. Almost all in-vehicle embedded software interacts with CAN, so it's a core skill for the role.",
      },
    ],
  },
  {
    slug: "ev-service-technician",
    role: "EV Service Technician",
    tagline: "Diagnose, repair and maintain electric vehicles safely in the field",
    salaryRoleSlug: "ev-service-technician",
    domainSlug: "after-sales",
    domainName: "After-sales & Service",
    jobsQuery: "EV service technician",
    metaTitle: "How to Become an EV Service Technician in India (2026) — Skills, Salary & Roadmap",
    metaDescription:
      "Become an EV service technician in India: the high-voltage safety, diagnostics and repair skills you need, the ITI/diploma routes, certifications, salary and who's hiring.",
    summary:
      "EV service technicians diagnose, repair and maintain electric vehicles — from high-voltage battery and motor systems to chargers — making them one of the most in-demand hands-on roles as EVs hit the road in volume.",
    overview: [
      "As lakhs of electric two-, three- and four-wheelers reach Indian roads, someone has to service them — and conventional mechanics aren't trained for high-voltage systems. EV service technicians fill that gap: safely diagnosing faults, replacing modules, servicing motors and chargers, and using diagnostic tools.",
      "It's a skilled-trade role with a fast, practical entry path (ITI, diploma or focused EV certification) and strong demand from OEM service networks, dealerships and independent EV garages. For hands-on people, it's one of the most accessible ways into the EV industry.",
    ],
    whatYouDo: [
      "Diagnose EV faults using scan tools and diagnostic software",
      "Safely work on high-voltage systems (isolation, PPE, lockout procedures)",
      "Replace and repair batteries, motors, controllers and wiring harnesses",
      "Service and troubleshoot on-board and external chargers",
      "Perform preventive maintenance and software updates",
      "Maintain service records and guide customers on EV care",
    ],
    hardSkills: [
      "High-voltage safety procedures & PPE",
      "EV diagnostics & scan tools",
      "Electrical fault-finding (multimeter, insulation tester)",
      "Battery, motor & controller servicing",
      "Charger troubleshooting",
      "Reading wiring diagrams",
    ],
    softSkills: [
      "Careful, safety-first work habits",
      "Practical problem-solving",
      "Customer communication",
      "Attention to detail",
    ],
    qualifications: [
      "ITI / diploma in electrical, electronics, automobile or mechatronics (or equivalent hands-on background)",
      "Dedicated EV-technician certification (high-voltage safety + diagnostics)",
      "Apprenticeship or workshop experience",
    ],
    steps: [
      {
        title: "Get a trade foundation",
        detail:
          "An ITI or diploma in electrical, electronics, automobile or mechatronics gives the base. If you're already a mechanic or electrician, you have a head start — you'll be adding EV-specific high-voltage skills on top.",
      },
      {
        title: "Learn high-voltage safety first",
        detail:
          "EVs carry lethal voltages. Before anything else, learn isolation procedures, personal protective equipment, and safe handling of high-voltage batteries and cabling. This is the single most important skill — and what separates an EV technician from a conventional one.",
      },
      {
        title: "Do an EV-technician certification",
        detail:
          "A focused EV course covering diagnostics, battery and motor servicing, and charger troubleshooting rapidly makes you employable. Hands-on training on real vehicles matters far more than theory alone.",
      },
      {
        title: "Build diagnostic skills",
        detail:
          "Learn to use scan tools and diagnostic software, read wiring diagrams, and fault-find with a multimeter and insulation tester. Diagnostics is where experienced technicians add the most value.",
      },
      {
        title: "Get workshop experience and apply",
        detail:
          "An apprenticeship or junior role at an OEM service centre, dealership or EV garage builds real-world skill fast. Then apply to service networks and workshops — demand for trained EV technicians is outpacing supply.",
      },
    ],
    careerPath: [
      "EV Technician Trainee / Apprentice",
      "EV Service Technician",
      "Senior EV Technician / Diagnostics Specialist",
      "Service Team Lead / Workshop Supervisor",
      "Service Centre Manager",
    ],
    topEmployers: [
      "Ather Energy",
      "Ola Electric",
      "TVS Motor",
      "Bajaj Auto",
      "Mahindra Last Mile Mobility",
      "EV dealership & service networks",
    ],
    faqs: [
      {
        question: "Can a regular mechanic become an EV technician?",
        answer:
          "Yes — and many do. Conventional mechanics and electricians have a strong foundation; the key addition is high-voltage safety plus EV-specific diagnostics, battery, motor and charger servicing. A focused EV certification bridges the gap quickly.",
      },
      {
        question: "Do I need a degree to be an EV service technician?",
        answer:
          "No. This is a skilled-trade role. An ITI or diploma plus a hands-on EV-technician certification is the typical path, and practical workshop experience matters most. A degree is not required.",
      },
      {
        question: "Is there demand for EV technicians in India?",
        answer:
          "High and growing. With lakhs of EVs on the road and OEM service networks expanding, trained EV technicians are in short supply — making it one of the most accessible and secure hands-on careers in the EV industry.",
      },
    ],
  },
];

export function getCareerGuide(slug: string): CareerGuide | undefined {
  return CAREER_GUIDES.find((g) => g.slug === slug);
}
