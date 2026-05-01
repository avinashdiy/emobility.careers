import { env } from "@/lib/env";

/**
 * Centralised email templates. All templates render to {subject, html, text}.
 * Keep them dumb — formatting only, no DB access.
 */

interface Tpl {
  subject: string;
  html: string;
  text: string;
}

const wrapper = (body: string, footer = "") => `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1e2d2a">
    <div style="background:#374a47;color:#c1ffb4;padding:20px 24px;border-radius:14px 14px 0 0">
      <strong style="font-size:18px">eMobility Careers</strong>
    </div>
    <div style="background:#fff;border:1px solid #d4e8d8;border-top:0;padding:24px;border-radius:0 0 14px 14px">
      ${body}
      ${footer ? `<hr style="border:none;border-top:1px solid #d4e8d8;margin:24px 0"><p style="color:#8a9e9a;font-size:12px;margin:0">${footer}</p>` : ""}
    </div>
  </div>`;

const cta = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#374a47;color:#c1ffb4;padding:10px 22px;border-radius:10px;text-decoration:none;font-weight:700">${label}</a>`;

export function passwordResetEmail(email: string, token: string): Tpl {
  const link = `${env.NEXT_PUBLIC_APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px">Reset your password</h2>
     <p>Someone (hopefully you) requested a password reset for <strong>${email}</strong>.</p>
     <p>${cta(link, "Reset password →")}</p>
     <p style="color:#5a6e6a">This link expires in 1 hour. If you didn't ask for this, ignore the email — your account is fine.</p>`,
    "If the button doesn't work, paste this URL into your browser: " + link,
  );
  return {
    subject: "Reset your eMobility Careers password",
    html,
    text: `Reset your password by visiting ${link} (expires in 1 hour). If this wasn't you, ignore this email.`,
  };
}

export function emailVerificationEmail(email: string, token: string): Tpl {
  const link = `${env.NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px">Verify your email</h2>
     <p>Confirm <strong>${email}</strong> is yours so you can apply to jobs and post listings.</p>
     <p>${cta(link, "Verify email →")}</p>
     <p style="color:#5a6e6a">This link expires in 24 hours.</p>`,
    "If the button doesn't work, paste this URL into your browser: " + link,
  );
  return {
    subject: "Verify your eMobility Careers email",
    html,
    text: `Verify your email by visiting ${link} (expires in 24 hours).`,
  };
}

export function welcomeEmail(name: string, role: "CANDIDATE" | "EMPLOYER"): Tpl {
  const where = role === "EMPLOYER" ? "/employer/onboarding" : "/onboarding";
  const html = wrapper(
    `<h2 style="margin:0 0 12px">Welcome, ${name}!</h2>
     <p>You're in. ${role === "EMPLOYER" ? "Set up your company to start posting EV-industry roles" : "Build your profile to start matching with EV-industry jobs"}.</p>
     <p>${cta(env.NEXT_PUBLIC_APP_URL + where, "Get started →")}</p>`,
    "Need help? Reply to this email.",
  );
  return {
    subject: `Welcome to eMobility Careers, ${name}`,
    html,
    text: `Welcome to eMobility Careers. Get started: ${env.NEXT_PUBLIC_APP_URL}${where}`,
  };
}

/**
 * Sent to the company owner when an admin rejects their company page
 * verification. Includes the admin-supplied reason verbatim and a link
 * back to /employer/company so they can fix what was flagged and
 * request re-verification. Tone: candid, not punitive — the owner
 * may have made a recoverable mistake (incomplete page, missing
 * domain ownership proof) rather than acted in bad faith.
 */
export function companyRejectedEmail(input: {
  ownerName: string | null;
  companyName: string;
  reason: string;
}): Tpl {
  const safeReason = input.reason
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const html = wrapper(
    `<h2 style="margin:0 0 12px">Your company page was rejected</h2>
     <p>Hi${input.ownerName ? ` ${input.ownerName}` : ""},</p>
     <p>An admin has rejected the verification for <strong>${input.companyName}</strong> on eMobility Careers. While the page is in the rejected state it won't appear publicly and your jobs won't be discoverable.</p>
     <p style="margin:16px 0 8px"><strong>Reason from the admin:</strong></p>
     <blockquote style="margin:0;padding:12px 16px;border-left:3px solid #f59e0b;background:#fef3c7;color:#78350f;font-size:14px;line-height:1.5;white-space:pre-wrap">${safeReason}</blockquote>
     <p>Update the company page to address this and we'll review again. Common fixes:</p>
     <ul>
       <li>Make sure the company name and details match your registered business.</li>
       <li>Add a website that uses an email domain you can verify.</li>
       <li>Fill in HQ location, team size, and a real description.</li>
     </ul>
     <p>${cta(env.NEXT_PUBLIC_APP_URL + "/employer/company", "Edit company page →")}</p>`,
    "If you think this was rejected by mistake, reply to this email and we'll take another look.",
  );
  return {
    subject: `Verification rejected for ${input.companyName}`,
    html,
    text: `Your company "${input.companyName}" was rejected on eMobility Careers.\n\nReason: ${input.reason}\n\nFix the page at ${env.NEXT_PUBLIC_APP_URL}/employer/company and we'll re-review.`,
  };
}
