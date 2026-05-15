import { db } from "@/lib/db";

/**
 * #2 Wave A — Profile Quality Score.
 *
 * Sits ALONGSIDE the existing `evaluateProfile()` completeness scorer.
 * Completeness asks "did you fill in the box?". Quality asks "is what
 * you filled in actually good?". Two distinct signals — a profile
 * with a 12-word summary and a 12-skill list scores 100% on
 * completeness but maybe 55% on quality.
 *
 * Five axes, each scored 0..100 and shown as a separate bar in the
 * /me dashboard's "Profile Quality" card. Total score is a simple
 * mean — easier to explain than a weighted blend, and the per-axis
 * bars surface which one to fix first.
 */

export interface QualityAxis {
  id: "headline" | "skills" | "experience" | "verifications" | "activity";
  /** Short candidate-facing label. */
  label: string;
  /** 0..100. */
  score: number;
  /** One-line tip when score < 100. Empty when already great. */
  hint: string;
}

export interface ProfileQualityResult {
  /** Weighted/average score 0..100. */
  total: number;
  axes: QualityAxis[];
}

interface QualityInputs {
  headline: string | null;
  summary: string | null;
  skillNames: string[];
  evDomains: string[];
  experienceCount: number;
  educationCount: number;
  certificationCount: number;
  projectCount: number;
  totalExperienceMonths: number;
  // Verifications
  emailVerified: boolean;
  phoneVerified: boolean;
  isDIYguruVerified: boolean;
  isIDVerified: boolean;
  verifiedSkillBadgeCount: number;
  // Recent activity (last 30 days)
  postsLast30d: number;
  applicationsLast30d: number;
  profileUpdatedDaysAgo: number;
}

/**
 * Pure scorer. Caller assembles the inputs (one round-trip via
 * `loadProfileQualityInputs()` below). Keeps the math testable
 * without hitting the DB.
 */
export function evaluateProfileQuality(inputs: QualityInputs): ProfileQualityResult {
  const axes: QualityAxis[] = [
    scoreHeadlineAxis(inputs),
    scoreSkillsAxis(inputs),
    scoreExperienceAxis(inputs),
    scoreVerificationsAxis(inputs),
    scoreActivityAxis(inputs),
  ];
  const total = Math.round(axes.reduce((s, a) => s + a.score, 0) / axes.length);
  return { total, axes };
}

function scoreHeadlineAxis(i: QualityInputs): QualityAxis {
  let score = 0;
  // Headline scoring: rewards length in the 30-100 char sweet spot,
  // penalises empty or one-word. Job title without "EV" / "battery" /
  // "charging" keywords stays in the middle band.
  const h = (i.headline ?? "").trim();
  const s = (i.summary ?? "").trim();
  if (h.length >= 10) score += 15;
  if (h.length >= 30) score += 15;
  if (h.length >= 50 && h.length <= 130) score += 10;
  // Specificity: did the candidate name an EV term?
  if (/\b(ev|electric|battery|charg(ing|er)|bms|motor|inverter|powertrain|hydrogen|fleet|emobility)\b/i.test(h)) {
    score += 10;
  }
  // Summary length bands. 50-300 words = full credit; longer = no
  // bonus; missing = zero contribution.
  const summaryWords = s ? s.split(/\s+/).length : 0;
  if (summaryWords >= 30) score += 15;
  if (summaryWords >= 80) score += 15;
  if (summaryWords >= 150) score += 10;
  score = Math.min(100, score);

  const tips: string[] = [];
  if (h.length < 30) tips.push("Make your headline more specific (e.g. role + domain + years)");
  if (!/\b(ev|electric|battery|charg|bms|motor|powertrain)\b/i.test(h)) tips.push("Mention an EV term in your headline so it surfaces in recruiter searches");
  if (summaryWords < 80) tips.push("Aim for an 80-150 word About section that names the specific stack you've worked on");
  return {
    id: "headline",
    label: "Headline & summary",
    score,
    hint: tips[0] ?? "Strong",
  };
}

function scoreSkillsAxis(i: QualityInputs): QualityAxis {
  let score = 0;
  // Count bands. Past 12 skills, no extra credit (recruiters scan
  // first 8; loading up the page beyond doesn't help).
  if (i.skillNames.length >= 3) score += 25;
  if (i.skillNames.length >= 6) score += 25;
  if (i.skillNames.length >= 9) score += 15;
  if (i.skillNames.length >= 12) score += 5;
  // EV domain count
  if (i.evDomains.length >= 1) score += 15;
  if (i.evDomains.length >= 2) score += 10;
  // Verified skill badges (Wave C #28) — a small bonus per badge
  score += Math.min(20, i.verifiedSkillBadgeCount * 5);
  score = Math.min(100, score);

  const tips: string[] = [];
  if (i.skillNames.length < 6) tips.push("List 6-12 specific skills — the more concrete (e.g. 'AUTOSAR' over 'embedded software'), the better");
  if (i.evDomains.length < 1) tips.push("Pick at least one EV domain so domain-filtered searches surface you");
  if (i.verifiedSkillBadgeCount === 0) tips.push("Take a free EV skill assessment at /skills to earn a verified badge");
  return {
    id: "skills",
    label: "Skills depth",
    score,
    hint: tips[0] ?? "Strong",
  };
}

function scoreExperienceAxis(i: QualityInputs): QualityAxis {
  let score = 0;
  // Experience entries: each up to 3.
  if (i.experienceCount >= 1) score += 25;
  if (i.experienceCount >= 2) score += 15;
  if (i.experienceCount >= 3) score += 10;
  // Years of experience (signals depth; freshers can still score
  // 100 via projects + education).
  if (i.totalExperienceMonths >= 12) score += 15;
  if (i.totalExperienceMonths >= 36) score += 5;
  // Education
  if (i.educationCount >= 1) score += 15;
  // Projects
  if (i.projectCount >= 1) score += 5;
  if (i.projectCount >= 3) score += 5;
  // Certifications (existing freeform Certification entries)
  if (i.certificationCount >= 1) score += 5;
  score = Math.min(100, score);

  const tips: string[] = [];
  if (i.experienceCount < 1) tips.push("Add at least one work experience — even an internship");
  if (i.projectCount < 1) tips.push("Showcase a project — recruiters look for proof of hands-on work");
  if (i.certificationCount < 1) tips.push("Add a certification (DIYguru, ARAI, SAEINDIA) — credentials lift recruiter trust");
  return {
    id: "experience",
    label: "Experience & education",
    score,
    hint: tips[0] ?? "Strong",
  };
}

function scoreVerificationsAxis(i: QualityInputs): QualityAxis {
  // Each verification is a fixed contribution. Caps at 100.
  let score = 0;
  if (i.emailVerified) score += 20;
  if (i.phoneVerified) score += 20;
  if (i.isIDVerified) score += 30;
  if (i.isDIYguruVerified) score += 30;
  score = Math.min(100, score);

  const tips: string[] = [];
  if (!i.emailVerified) tips.push("Verify your email — the green-tick boosts every search rank");
  if (!i.phoneVerified) tips.push("Verify your phone — recruiters trust phone-verified profiles 2× more");
  if (!i.isIDVerified) tips.push("Submit ID verification at /me/verify — Twitter-style blue checkmark across the site");
  if (!i.isDIYguruVerified) tips.push("If you trained at DIYguru, sign in with that email to auto-claim the DIYguru badge");
  return {
    id: "verifications",
    label: "Verifications",
    score,
    hint: tips[0] ?? "All verified",
  };
}

function scoreActivityAxis(i: QualityInputs): QualityAxis {
  let score = 0;
  // Recency of profile edits — strong signal, recruiters favour
  // "recently active" candidates.
  if (i.profileUpdatedDaysAgo <= 7) score += 30;
  else if (i.profileUpdatedDaysAgo <= 30) score += 20;
  else if (i.profileUpdatedDaysAgo <= 90) score += 5;
  // Posts in last 30d
  if (i.postsLast30d >= 1) score += 25;
  if (i.postsLast30d >= 3) score += 15;
  // Applications in last 30d (proxy for activity, not necessarily
  // good — too many applications is its own bad signal, so cap at 5)
  if (i.applicationsLast30d >= 1) score += 15;
  if (i.applicationsLast30d >= 3) score += 15;
  score = Math.min(100, score);

  const tips: string[] = [];
  if (i.profileUpdatedDaysAgo > 30) tips.push("Tweak something on your profile — even small edits bump you in recency-weighted searches");
  if (i.postsLast30d < 1) tips.push("Post once a week in your EV domain — visibility in the feed is one of the strongest signals to recruiters");
  return {
    id: "activity",
    label: "Recent activity",
    score,
    hint: tips[0] ?? "Active",
  };
}

/**
 * Single-call helper: loads everything the scorer needs from the DB
 * for the given candidate id. ~3 round-trips total (extra counts
 * for activity). Cheap enough to call from the /me dashboard.
 */
export async function loadProfileQualityInputs(candidateProfileId: string): Promise<QualityInputs> {
  const profile = await db.candidateProfile.findUnique({
    where: { id: candidateProfileId },
    include: {
      skills: { include: { skill: { select: { name: true } } } },
      evDomains: { include: { evDomain: { select: { slug: true } } } },
      experiences: { select: { id: true } },
      education: { select: { id: true } },
      certifications: { select: { id: true } },
      projects: { select: { id: true } },
      verifiedSkillBadges: { select: { id: true } },
      user: { select: { id: true, emailVerifiedAt: true, phoneVerifiedAt: true } },
    },
  });
  if (!profile) {
    throw new Error(`Candidate ${candidateProfileId} not found`);
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [postsLast30d, applicationsLast30d] = await Promise.all([
    db.post.count({
      where: {
        authorId: profile.userId,
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    db.application.count({
      where: {
        candidateId: profile.id,
        appliedAt: { gte: thirtyDaysAgo },
      },
    }),
  ]);

  const updatedDaysAgo = Math.floor(
    (Date.now() - profile.updatedAt.getTime()) / (24 * 60 * 60 * 1000),
  );

  return {
    headline: profile.headline,
    summary: profile.summary,
    skillNames: profile.skills.map((s) => s.skill.name),
    evDomains: profile.evDomains.map((d) => d.evDomain.slug),
    experienceCount: profile.experiences.length,
    educationCount: profile.education.length,
    certificationCount: profile.certifications.length,
    projectCount: profile.projects.length,
    totalExperienceMonths: profile.totalExperienceMonths,
    emailVerified: !!profile.user.emailVerifiedAt,
    phoneVerified: !!profile.user.phoneVerifiedAt,
    isDIYguruVerified: profile.isDIYguruVerified,
    isIDVerified: profile.idVerificationStatus === "VERIFIED",
    verifiedSkillBadgeCount: profile.verifiedSkillBadges.length,
    postsLast30d,
    applicationsLast30d,
    profileUpdatedDaysAgo: updatedDaysAgo,
  };
}
