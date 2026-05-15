"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimitOrThrow } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { issueToken, consumeToken } from "@/lib/auth-tokens";
import {
  emailDomain,
  findCompanyByEmailDomain,
  stampExperiencesForCompany,
  experienceVerifyUrl,
} from "@/lib/experience-verify";
import { env } from "@/lib/env";

/**
 * Verified Company badge — server flows.
 *
 *   • requestExperienceEmailVerify(experienceId, email)
 *     → owner-only. Sends a one-time link to a work email; on click,
 *       stamps the Experience row (and any sibling rows at the same
 *       company) as VERIFIED via EMAIL_DOMAIN.
 *
 *   • confirmExperienceEmailVerify(token)
 *     → public. Consumes the token, stamps the experience.
 *
 *   • recruiterApproveExperience / recruiterRejectExperience
 *     → recruiter-only. The candidate's claim becomes VERIFIED via
 *       RECRUITER_APPROVAL when an employer-team-member at the SAME
 *       company approves it. Rejection clears any stale state without
 *       blocking re-attempts.
 */

const requestSchema = z.object({
  experienceId: z.string(),
  email: z.string().email().toLowerCase(),
});

export async function requestExperienceEmailVerify(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "CANDIDATE" && session.user.role !== "ADMIN") redirect("/403");

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/me/profile?error=" + encodeURIComponent("Enter a valid email address."));
  }

  // Per-user rate-limit so a candidate can't spam OTP requests across
  // 50 fake addresses to fingerprint company domains.
  await rateLimitOrThrow(`exp-verify:${session.user.id}`, "invite").catch(() => undefined);

  const { experienceId, email } = parsed.data;
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/onboarding");

  // Confirm the experience belongs to the caller and has a companyId
  // attached. We never verify free-text-only entries — without a
  // structured Company row there's nothing to stamp the badge against.
  const exp = await db.experience.findFirst({
    where: { id: experienceId, candidateId: profile.id },
    select: { id: true, companyId: true, company: true, verifiedAt: true },
  });
  if (!exp) redirect("/me/profile?error=" + encodeURIComponent("Experience not found."));
  if (exp.verifiedAt) {
    redirect(`/me/profile?notice=` + encodeURIComponent(`Already verified at ${exp.company}.`));
  }
  if (!exp.companyId) {
    redirect(
      "/me/profile?error=" +
        encodeURIComponent(
          `Link the company in this experience entry first (use the picker above the title).`,
        ),
    );
  }

  // Domain-allowlist check. The Company must list this email's domain
  // in its `emailDomains` allowlist — that's how we trust that an
  // OTP delivered there proves employment.
  const dom = emailDomain(email);
  const company = await db.company.findUnique({
    where: { id: exp.companyId },
    select: { id: true, name: true, emailDomains: true },
  });
  if (!company) redirect("/me/profile?error=Company+not+found");
  if (!dom || !company.emailDomains.includes(dom)) {
    redirect(
      "/me/profile?error=" +
        encodeURIComponent(
          `That email's domain isn't on ${company.name}'s allowlist. Use a current ${company.name} work email, or ask a recruiter on their team to approve from /employer/verifications.`,
        ),
    );
  }

  // Issue + email the link. We encode `${experienceId}:${email}` into
  // the token identifier so the consume side knows which row to stamp.
  const { token } = await issueToken("experience-verify", `${experienceId}:${email}`);
  const url = experienceVerifyUrl(token, env.NEXT_PUBLIC_APP_URL);

  const { sendMail } = await import("@/lib/mail");
  await sendMail({
    to: email,
    subject: `Verify your role at ${company.name}`,
    html: `
<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7f5;padding:24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <tr><td>
      <h1 style="font-size:20px;color:#0f172a;margin:0 0 12px 0;">Verify your role at ${company.name}</h1>
      <p style="color:#475569;margin:0 0 24px 0;">Click below to add a <strong>✓ Verified</strong> badge to your ${company.name} experience entry on emobility.careers. The link expires in 24 hours.</p>
      <p style="margin:0 0 24px 0;">
        <a href="${url}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Verify badge →</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0;">If you didn't request this, ignore — no changes were made to your profile.</p>
    </td></tr>
  </table>
</body></html>`,
    text: `Verify your role at ${company.name}\n\n${url}\n\nLink expires in 24 hours.`,
  }).catch((err) => logger.warn({ err }, "[exp-verify] email send failed"));

  redirect(
    "/me/profile?notice=" +
      encodeURIComponent(
        `📬 Check ${email} for a verification link. It expires in 24 hours.`,
      ),
  );
}

export async function confirmExperienceEmailVerify(token: string): Promise<{ ok: boolean; companyName?: string }> {
  const identifier = await consumeToken("experience-verify", token);
  if (!identifier) return { ok: false };
  // identifier = `${experienceId}:${email}` — we encoded it in issueToken.
  const sep = identifier.lastIndexOf(":");
  if (sep < 0) return { ok: false };
  const experienceId = identifier.slice(0, sep);
  const email = identifier.slice(sep + 1);

  const exp = await db.experience.findUnique({
    where: { id: experienceId },
    select: {
      id: true,
      candidateId: true,
      companyId: true,
      candidate: { select: { userId: true, slug: true } },
      company: true,
    },
  });
  if (!exp || !exp.companyId) return { ok: false };

  // Re-check the domain match at consume time (the company's allowlist
  // could have changed between issue + click).
  const company = await findCompanyByEmailDomain(email);
  if (!company || company.id !== exp.companyId) return { ok: false };

  const stamped = await stampExperiencesForCompany({
    candidateId: exp.candidateId,
    companyId: exp.companyId,
    email,
    method: "EMAIL_DOMAIN",
  });

  await audit({
    actorId: exp.candidate.userId,
    action: "experience.verified.email",
    entity: "Experience",
    entityId: exp.id,
    meta: { domain: emailDomain(email), stampedRows: stamped, companyId: exp.companyId },
  });

  revalidatePath("/me/profile");
  revalidatePath(`/${exp.candidate.slug}`);
  return { ok: true, companyName: company.name };
}

// ─── Recruiter approval ────────────────────────────────────

const recruiterDecisionSchema = z.object({
  experienceId: z.string(),
});

async function requireRecruiterAtCompany(experienceId: string) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "EMPLOYER" && session.user.role !== "ADMIN") redirect("/403");

  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    select: { companyId: true },
  });
  if (!employer && session.user.role !== "ADMIN") redirect("/employer/onboarding");

  const exp = await db.experience.findUnique({
    where: { id: experienceId },
    include: {
      candidate: { select: { id: true, userId: true, slug: true } },
      companyRef: { select: { id: true, name: true } },
    },
  });
  if (!exp) redirect("/employer/verifications");
  if (!exp.companyId) redirect("/employer/verifications");
  if (
    session.user.role !== "ADMIN" &&
    exp.companyId !== employer?.companyId
  ) {
    redirect("/403");
  }
  return { session, exp };
}

export async function recruiterApproveExperience(formData: FormData) {
  const parsed = recruiterDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[experience-verify] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }
  const { session, exp } = await requireRecruiterAtCompany(parsed.data.experienceId);

  if (exp.verifiedAt) {
    redirect("/employer/verifications?notice=" + encodeURIComponent("Already verified."));
  }

  await stampExperiencesForCompany({
    candidateId: exp.candidate.id,
    companyId: exp.companyId!,
    email: "",
    method: "RECRUITER_APPROVAL",
    verifierUserId: session.user.id,
  });

  await audit({
    actorId: session.user.id,
    action: "experience.verified.recruiter",
    entity: "Experience",
    entityId: exp.id,
    meta: { companyId: exp.companyId, candidateUserId: exp.candidate.userId },
  });

  revalidatePath("/employer/verifications");
  revalidatePath(`/${exp.candidate.slug}`);
}

export async function recruiterRejectExperience(formData: FormData) {
  const parsed = recruiterDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    logger.warn(
      { fieldErrors: parsed.error.flatten().fieldErrors },
      "[experience-verify] Zod validation failed — bare form action returns void; user sees no feedback.",
    );
    return;
  }
  const { session, exp } = await requireRecruiterAtCompany(parsed.data.experienceId);

  // Rejection here is an explicit "I don't recognise this person" — we
  // don't write a flag (the candidate may still earn the badge via the
  // email-domain path). Audit log captures the moderator action.
  await audit({
    actorId: session.user.id,
    action: "experience.rejected.recruiter",
    entity: "Experience",
    entityId: exp.id,
    meta: { companyId: exp.companyId, candidateUserId: exp.candidate.userId },
  });

  revalidatePath("/employer/verifications");
}
