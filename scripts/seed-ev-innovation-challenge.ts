/**
 * Seed the EV Innovation & Business Challenge 2026 — hosted by
 * DIYguru for eBAJA SAEINDIA and Formula Bharat student-team
 * participants.
 *
 * Brief (from the platform owner):
 *   • Target audience — eBAJA + Formula Bharat student teams
 *   • Deliverables — Innovation presentation, Business presentation
 *     and Technical presentation uploaded as a single submission
 *   • Evaluation — best original submission + innovation + cost
 *     structure + startup plan
 *   • Prizes (paid before the final main event) —
 *       Winner: ₹1,00,000 cash
 *       Runner-up: ₹50,000 cash
 *   • Submission deadline: Aug 19, 2026
 *   • Winners announced: Sep 5, 2026
 *
 * The script is idempotent (upsert on slug). Re-runs:
 *   • Refresh the description, rules, prizes and judging criteria
 *     to match this file (i.e. this file is the canonical source).
 *   • Preserve any extra prizes / stages / judges the admin added
 *     through /admin/competitions or /employer/competitions.
 *
 * Run:
 *   pnpm db:seed-ev-innovation-challenge
 *
 * The competition lands as LIVE (status=LIVE, publishedAt=now) so
 * it's immediately visible at /competitions and /competitions/<slug>.
 * Admin can move it to JUDGING / RESULTS via the existing lifecycle
 * UI as the timeline progresses.
 */

import {
  PrismaClient,
  CompetitionType,
  CompetitionStatus,
  CompetitionStageKind,
} from "@prisma/client";

const db = new PrismaClient();

// ─── Constants from the brief ─────────────────────────────────
const SLUG = "ev-innovation-business-challenge-2026";
const HOST_COMPANY_SLUG = "u-diyguru";

// Timeline anchored on Asia/Kolkata. We construct the dates in UTC
// so they're stable regardless of the host machine's TZ.
const REGISTRATION_OPENS_AT = new Date("2026-05-20T00:00:00.000Z");
const REGISTRATION_CLOSES_AT = new Date("2026-08-19T18:30:00.000Z"); // 00:00 IST Aug 20
const SUBMISSION_DEADLINE = new Date("2026-08-19T18:30:00.000Z"); // 00:00 IST Aug 20
const STARTS_AT = REGISTRATION_OPENS_AT;
// `endsAt` = submission deadline. `resultsAt` = result-declaration
// date. The two are separate fields per schema so the public page
// can show both clearly.
const ENDS_AT = SUBMISSION_DEADLINE;
const RESULTS_AT = new Date("2026-09-05T08:30:00.000Z"); // 14:00 IST Sep 5

// Prizes — stored as smallest currency unit (paise for INR).
const PRIZE_WINNER_INR = 1_00_000;
const PRIZE_RUNNERUP_INR = 50_000;
const TOTAL_PRIZE_POOL_INR = PRIZE_WINNER_INR + PRIZE_RUNNERUP_INR;

// ─── Long-form copy ──────────────────────────────────────────
// Markdown is rendered by the public /competitions/[slug] page via
// the same `prose` pipeline as article bodies; basic markdown
// (headings, lists, bold) renders cleanly.

const DESCRIPTION = `## About the EV Innovation & Business Challenge 2026

Indian student-engineering teams competing at **eBAJA SAEINDIA** and **Formula Bharat** ship some of the most innovative student-built EVs in the country every year — but the work rarely travels beyond the event grounds. This challenge, hosted by **DIYguru** on emobility.careers, gives those teams a structured path to package their innovation as a business and present it to industry judges before they take their vehicle to the final event.

The deliverable is a single submission containing three short presentations: **Innovation**, **Technical** and **Business + Cost Structure**. Judges evaluate originality, depth of engineering work, cost realism and the credibility of a startup-ready commercial plan.

The top two teams receive cash prizes — **₹1,00,000 for the winning team** and **₹50,000 for the runner-up** — disbursed *before* their main event so the money can fund their final prototype, travel or kit logistics.

## What you submit

A single zip / linked-folder containing the three decks below:

1. **Innovation Presentation** — what's novel about your sub-system, drivetrain or full-vehicle approach. 10-15 slides.
2. **Technical Presentation** — the engineering depth behind your innovation. BOM, schematics, FEA / CFD / dyno results, validation plan. 15-25 slides.
3. **Business & Cost Structure Presentation** — TAM, target customer, unit economics, BOM cost, 3-year revenue plan, GTM and a startup-readiness assessment. 10-15 slides.

A short prototype-walkthrough video (3-5 minutes, optional but recommended) significantly strengthens shortlisting.

## Who can participate

Open to **student teams currently registered for or actively competing at** eBAJA SAEINDIA (2026 or 2027 cycles) or Formula Bharat. Both new and recurring teams welcome. Teams of 4-12 student members from the same institution.

Teams must register on emobility.careers, complete their public team profile (this powers the visibility for sponsors and judges) and submit before the deadline.

## Why participate

- **₹1,00,000 / ₹50,000 in cash** disbursed before your main event — direct prize money, no equity ask, no strings.
- **Industry visibility** — the top 10 teams' decks are circulated to a curated panel of EV-industry hiring managers, accelerator partners and investors via DIYguru's network.
- **Recruiter inbox** — every registered team's captain and members get fast-tracked into the emobility.careers candidate pool and surfaced to recruiters at OEMs, Tier-1 suppliers and EV startups.
- **DIYguru certification credit** — all participating teams receive credit toward DIYguru's AICTE-approved EV Powertrain or BMS specialisations.
- **Real feedback** — every submission receives written feedback from at least two senior judges (not just a numeric score).
`;

const RULES = `## Eligibility

- Team must be a registered eBAJA SAEINDIA or Formula Bharat participant for the 2026 or 2027 event cycle.
- Minimum 4 and maximum 12 student members from the same institution.
- A faculty advisor email is required at registration (verification ping is sent).
- Each institution may submit at most **two** teams. If two teams from the same institution finalise, they must work independently.

## Submission rules

- One **combined submission** containing all three decks (Innovation + Technical + Business). Combined deck or separate PDFs both accepted.
- Decks must be in English or Hindi (Hindi decks must include an English summary slide).
- All content must be **original** — code, simulations, designs and CAD must be the team's own work. References to open-source libraries or papers are required where used.
- An optional prototype-walkthrough video (3-5 min) significantly strengthens shortlisting.
- No teaser / partial submissions — incomplete submissions are auto-disqualified at the moderation stage.

## Originality + plagiarism

- DIYguru runs a structured originality review on every submission (decks + linked artefacts).
- Detected plagiarism above 25% (excluding cited references) is grounds for disqualification.
- Teams must be willing to defend any claim on a 30-minute video call if requested by judges.

## Cash prize disbursement

- Prizes are disbursed by bank transfer to the **institution's** student-team account (not individual accounts).
- A signed letter from the team's faculty advisor on institution letterhead is required for disbursement.
- Disbursement happens within 30 days of result declaration (i.e. by 5 Oct 2026) and is timed to land **before** the team's main eBAJA or Formula Bharat event window.
- TDS / tax compliance: prize income is reported per Section 194B; teams should consult their institution's finance office for the exact treatment.

## Conduct

- Captains accept responsibility for their team's representation on emobility.careers.
- Public team-page content must be respectful and accurate; harassing, plagiarised or unverifiable content leads to disqualification.
- DIYguru reserves the right to disqualify any submission found to violate the spirit of the brief.
`;

const ELIGIBILITY = `Active or recently-registered student teams of eBAJA SAEINDIA or Formula Bharat (2026 / 2027 cycles). 4-12 student members from a single institution. Faculty-advisor email required.`;

// Judging criteria — surfaced on /competitions/<slug>, used during
// /employer/competitions/<id>/judge scoring, and printed in the
// public rules page. Weights sum to 100.
const JUDGING_CRITERIA = [
  {
    name: "Innovation & Originality",
    weight: 30,
    description:
      "How novel is the technical or business approach? Is the work clearly original, with appropriate credit for any inspiration / open-source / prior art?",
  },
  {
    name: "Technical Depth & Validation",
    weight: 25,
    description:
      "Quality of engineering — schematics, simulations, BOM, validation plan. Evidence that the design is implementable, not just conceptual.",
  },
  {
    name: "Cost Structure & Realism",
    weight: 20,
    description:
      "Detailed BOM cost, unit economics and realistic supplier-side cost decisions. Evidence the team has talked to vendors / done teardown analysis.",
  },
  {
    name: "Startup & Commercialisation Plan",
    weight: 15,
    description:
      "TAM, target segment, GTM, 3-year revenue plan and a credible founding-team / capability story. The startup angle that makes this more than a project.",
  },
  {
    name: "Presentation Quality",
    weight: 10,
    description:
      "Clarity, structure, narrative flow, slide design. Includes a clear summary and a working-prototype video where provided.",
  },
];

const TAGLINE =
  "₹1L for the winning team, ₹50k for the runner-up — for eBAJA + Formula Bharat student teams. Submit by 19 Aug 2026.";

// ─── Stage definitions ────────────────────────────────────────
// We model the timeline as 3 stages: REGISTRATION, SUBMISSION,
// PRESENTATION (judges' rubric scoring + finalist deliberation).
// The platform's submission machinery hangs off the SUBMISSION stage.

const STAGES = [
  {
    order: 1,
    name: "Team registration",
    kind: CompetitionStageKind.REGISTRATION,
    description:
      "Captain creates the team profile on emobility.careers, adds members (4-12), specifies the external event (eBAJA SAEINDIA or Formula Bharat) and the institution. Faculty-advisor email is required.",
    startsAt: REGISTRATION_OPENS_AT,
    endsAt: REGISTRATION_CLOSES_AT,
    requiresAllMembers: false,
  },
  {
    order: 2,
    name: "Submission — three decks + optional video",
    kind: CompetitionStageKind.SUBMISSION,
    description:
      "Upload the Innovation, Technical and Business decks as one combined submission. Optional prototype-walkthrough video (3-5 min). Late submissions are auto-flagged and not eligible for prizes.",
    startsAt: REGISTRATION_OPENS_AT,
    endsAt: SUBMISSION_DEADLINE,
    requiresAllMembers: false,
  },
  {
    order: 3,
    name: "Judging & winner announcement",
    kind: CompetitionStageKind.PRESENTATION,
    description:
      "Judges score submissions against the five-criterion rubric. Top 10 teams are shortlisted; top 2 are invited to a short live presentation. Winners announced 5 Sep 2026.",
    startsAt: new Date("2026-08-20T00:00:00.000Z"),
    endsAt: RESULTS_AT,
    advanceTopN: 2,
    requiresAllMembers: false,
  },
] as const;

// ─── Driver ───────────────────────────────────────────────────

async function main() {
  console.log(`🏁 Seeding EV Innovation & Business Challenge 2026 …`);

  // 1. Resolve host company. DIYguru Academy is the canonical
  //    in-platform identity for the brand — already seeded by
  //    scripts/seed.ts. If it's missing we bail with a clear note.
  const host = await db.company.findUnique({
    where: { slug: HOST_COMPANY_SLUG },
    select: { id: true, name: true },
  });
  if (!host) {
    console.error(
      `✗ Host company "${HOST_COMPANY_SLUG}" not found. ` +
        `Run pnpm db:seed first to bootstrap the company table.`,
    );
    process.exit(1);
  }

  // 2. Resolve the admin user who'll be recorded as the
  //    `postedBy` on the competition row. First ADMIN by created
  //    date is the convention used by the other seed scripts.
  const admin = await db.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error(
      `✗ No ADMIN user found. Run pnpm db:seed first to create the platform admin.`,
    );
    process.exit(1);
  }

  // 3. Upsert the competition itself.
  const data = {
    title: "EV Innovation & Business Challenge 2026 (eBAJA + Formula Bharat)",
    tagline: TAGLINE,
    description: DESCRIPTION,
    bannerImageUrl: null,
    hostCompanyId: host.id,
    postedById: admin.id,
    type: CompetitionType.INNOVATION,
    // The challenge spans Battery / Powertrain / Vehicle Engineering —
    // surfaces under all three on the public /competitions index.
    evDomainSlugs: ["battery-tech", "powertrain", "vehicle-engineering", "motor-control"] as string[],
    eligibility: ELIGIBILITY,
    rules: RULES,
    judgingCriteria: JUDGING_CRITERIA,
    isTeamBased: true,
    minTeamSize: 4,
    maxTeamSize: 12,
    registrationOpensAt: REGISTRATION_OPENS_AT,
    registrationClosesAt: REGISTRATION_CLOSES_AT,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    resultsAt: RESULTS_AT,
    totalPrizePoolMinor: TOTAL_PRIZE_POOL_INR,
    prizeCurrency: "INR",
    status: CompetitionStatus.LIVE,
    publishedAt: new Date(),
    isFeatured: true,
  };

  const competition = await db.competition.upsert({
    where: { slug: SLUG },
    create: { slug: SLUG, ...data },
    update: data,
    select: { id: true, slug: true, title: true },
  });

  console.log(
    `   → Competition upserted: "${competition.title}" (id=${competition.id})`,
  );

  // 4. Upsert the three stages. Composite key is (competitionId, order)
  //    per the schema — perfect for idempotent upsert.
  for (const stage of STAGES) {
    await db.competitionStage.upsert({
      where: {
        competitionId_order: {
          competitionId: competition.id,
          order: stage.order,
        },
      },
      create: {
        competitionId: competition.id,
        order: stage.order,
        name: stage.name,
        kind: stage.kind,
        description: stage.description,
        startsAt: stage.startsAt,
        endsAt: stage.endsAt,
        advanceTopN: "advanceTopN" in stage ? stage.advanceTopN : null,
        requiresAllMembers: stage.requiresAllMembers,
      },
      update: {
        name: stage.name,
        kind: stage.kind,
        description: stage.description,
        startsAt: stage.startsAt,
        endsAt: stage.endsAt,
        advanceTopN: "advanceTopN" in stage ? stage.advanceTopN : null,
        requiresAllMembers: stage.requiresAllMembers,
      },
    });
  }
  console.log(`   → ${STAGES.length} stages upserted`);

  // 5. Upsert the two prizes. Composite key is (competitionId, rank).
  const prizes = [
    {
      rank: 1,
      title: "Winning team",
      description:
        "Disbursed by bank transfer to the institution's student-team account within 30 days of result declaration (before the main eBAJA / Formula Bharat event).",
      cashAmountMinor: PRIZE_WINNER_INR,
      sponsor: "DIYguru",
      inKind:
        "Lifetime DIYguru learning credits for every team member + invitations to closed industry mentor sessions",
    },
    {
      rank: 2,
      title: "Runner-up team",
      description:
        "Disbursed by bank transfer to the institution's student-team account within 30 days of result declaration.",
      cashAmountMinor: PRIZE_RUNNERUP_INR,
      sponsor: "DIYguru",
      inKind:
        "DIYguru EV Powertrain / BMS specialisation credit for every team member",
    },
  ];

  for (const prize of prizes) {
    await db.competitionPrize.upsert({
      where: {
        competitionId_rank: {
          competitionId: competition.id,
          rank: prize.rank,
        },
      },
      create: {
        competitionId: competition.id,
        rank: prize.rank,
        title: prize.title,
        description: prize.description,
        cashAmountMinor: prize.cashAmountMinor,
        currency: "INR",
        sponsor: prize.sponsor,
        inKind: prize.inKind,
      },
      update: {
        title: prize.title,
        description: prize.description,
        cashAmountMinor: prize.cashAmountMinor,
        currency: "INR",
        sponsor: prize.sponsor,
        inKind: prize.inKind,
      },
    });
  }
  console.log(
    `   → ${prizes.length} prizes upserted (₹${(PRIZE_WINNER_INR / 100_000).toFixed(0)}L + ₹${(PRIZE_RUNNERUP_INR / 1_000).toFixed(0)}k)`,
  );

  // 6. Seed a kick-off announcement so the /competitions/<slug> page
  //    isn't blank under "Announcements". The component renders
  //    chronologically — admin can post follow-ups via the existing UI.
  //
  //    No (competitionId, title) unique constraint exists, so we
  //    fingerprint by title to keep this idempotent.
  const ANNOUNCEMENT_TITLE = "Registration is now open";
  const existingAnnouncement = await db.competitionAnnouncement.findFirst({
    where: { competitionId: competition.id, title: ANNOUNCEMENT_TITLE },
    select: { id: true },
  });
  if (!existingAnnouncement) {
    await db.competitionAnnouncement.create({
      data: {
        competitionId: competition.id,
        title: ANNOUNCEMENT_TITLE,
        body:
          "The EV Innovation & Business Challenge 2026 is live. eBAJA SAEINDIA and Formula Bharat student teams can register from today. " +
          "Submit your Innovation, Technical and Business decks by 19 Aug 2026 (23:59 IST). " +
          "Winners receive ₹1,00,000 (first) and ₹50,000 (runner-up) — disbursed before your main event window. " +
          "Results announced on 5 Sep 2026.",
        postedById: admin.id,
      },
    });
    console.log(`   → Kick-off announcement created`);
  } else {
    console.log(`   → Kick-off announcement already exists (skipped)`);
  }

  console.log(
    `\n✓ Seeded.\n   Public URL: /competitions/${SLUG}\n   Admin URL : /admin/competitions/${competition.id}\n   Status    : LIVE\n   Deadline  : 19 Aug 2026 · Results : 5 Sep 2026`,
  );
}

main()
  .catch((err) => {
    console.error("✗ EV Innovation Challenge seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
