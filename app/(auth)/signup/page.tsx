import { headers } from "next/headers";
import { Card } from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { turnstilePublicKey } from "@/lib/anti-spam";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";
import { coerceCountry, isSupportedCountry } from "@/lib/countries";
import type { Country } from "@prisma/client";

export const metadata = {
  title: "Create your account",
  description:
    "Create your eMobility Careers account — India's specialised EV-industry hiring platform. Apply to battery, charging, powertrain, and motor-engineering roles.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string; country?: string }>;
}) {
  const sp = await searchParams;
  const defaultRole = sp.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";
  const locale = await getLocale();

  // Resolve the visitor's country with three-step precedence:
  //   1. Explicit `?country=XX` URL param — wins because it carries
  //      deliberate intent (e.g. a UAE user landed via the /uk
  //      page's "Set up employer account" CTA and we want their
  //      signup tagged UK regardless of where their IP says they
  //      are right now).
  //   2. IP geolocation header (Cloudflare `CF-IPCountry` or
  //      Vercel `x-vercel-ip-country`) — the silent 95% path.
  //   3. `DEFAULT_COUNTRY` (India) — local dev, exotic CDN
  //      configurations, and unknown geo all fall through here.
  // `coerceCountry` validates each input against the supported
  // enum, so a malformed param or a country code we don't support
  // (e.g. "T1" for Tor exit nodes, "XK" for Kosovo) silently
  // falls through to the next step rather than 500-ing.
  const reqHeaders = await headers();
  const ipCountryHeader =
    reqHeaders.get("cf-ipcountry") ?? reqHeaders.get("x-vercel-ip-country");
  // Use the strict guard (NOT coerce) for the URL param so a junk
  // value falls through to IP rather than masquerading as the
  // default. `coerceCountry` is fine for the IP step — anything
  // unsupported there should land on the default.
  const paramUpper = sp.country?.toUpperCase();
  const defaultCountry: Country = isSupportedCountry(paramUpper)
    ? (paramUpper as Country)
    : coerceCountry(ipCountryHeader);

  // Destination-context banner — when the visitor arrived via a
  // deep "Create an account" CTA from a specific surface (TPO
  // college-registration, an apply-button on a job, etc.), explain
  // what they're signing up for INSTEAD of the generic "Create
  // your account" framing. Without this banner, Shivani's reported
  // case (HR head clicks "Create account" on /colleges/register,
  // lands on plain signup with no context, fills it out, gets sent
  // to /onboarding) is genuinely confusing — they have no signal
  // that the form is correct for their TPO intent.
  const destContext = resolveSignupDestinationContext(sp.next);

  return (
    <Card className="p-8">
      {destContext && (
        <div
          role="status"
          className="mb-4 rounded-md border border-emce-mid bg-emce-light-soft p-3 text-sm"
        >
          <p className="font-bold text-emce-text">{destContext.title}</p>
          <p className="mt-1 text-emce-text-sec">{destContext.body}</p>
        </div>
      )}
      <h1 className="text-2xl font-extrabold text-emce-text">{t("auth.signup.title", locale)}</h1>
      <p className="mt-1 text-sm text-emce-text-sec">{t("auth.signup.subtitle", locale)}</p>
      <div className="mt-6">
        <SignUpForm
          defaultRole={defaultRole}
          defaultCountry={defaultCountry}
          next={sp.next}
          turnstileSiteKey={turnstilePublicKey}
          labels={{
            whatBringsYou: t("auth.signup.whatBringsYou", locale),
            iAmCandidate: t("auth.signup.iAmCandidate", locale),
            iAmHiring: t("auth.signup.iAmHiring", locale),
            dualHint: t("auth.signup.dualHint", locale),
            fullName: t("auth.signup.fullName", locale),
            email: t("auth.signup.email", locale),
            password: t("auth.signup.password", locale),
            passwordHint: t("auth.signup.passwordHint", locale),
            // Country labels stay English in PR 1 — i18n dict entries
            // are a follow-up when we localise the rest of signup
            // (Hindi already partially covered; Arabic for AE comes
            // later). The form's English defaults match these.
            country: "Where you work",
            countryHint:
              "Drives your default currency, time zone, and the jobs we surface first. You can change this later from settings.",
            tosPreamble: t("auth.signup.tosPreamble", locale),
            tosTerms: t("auth.signup.tosTerms", locale),
            tosAnd: t("auth.signup.tosAnd", locale),
            tosPrivacy: t("auth.signup.tosPrivacy", locale),
            button: t("auth.signup.button", locale),
            pending: t("auth.signup.pending", locale),
            continueWith: t("auth.signup.continueWith", locale),
            alreadyHave: t("auth.signup.alreadyHave", locale),
            signInLink: t("auth.signup.signInLink", locale),
          }}
        />
      </div>
    </Card>
  );
}

/**
 * Map a `?next=…` destination to a friendly "you're signing up
 * for X" banner shown above the signup form. Returning `null`
 * means the generic signup framing renders (the default for
 * users who land on /signup directly).
 *
 * Add new cases here when a new deep-link CTA points at signup —
 * keeps the user-context messaging in one place instead of
 * scattering "edit the signup page" tickets across teams.
 */
function resolveSignupDestinationContext(
  next: string | undefined,
): { title: string; body: string } | null {
  if (!next || !next.startsWith("/")) return null;
  if (next.startsWith("/colleges/register")) {
    return {
      title: "You're signing up to register a college placement cell",
      body: "Create your account first — once signed in you'll see the placement-cell application form. Our team reviews TPO applications within 2 business days, then unlocks /tpo for your college.",
    };
  }
  if (next.startsWith("/employer")) {
    return {
      title: "You're signing up to hire on eMobility Careers",
      body: "Create your account first — then we'll guide you through setting up your company page.",
    };
  }
  if (next.startsWith("/job/")) {
    return {
      title: "Sign up to apply for this role",
      body: "Quick account creation, then you're back on the job page to submit your application.",
    };
  }
  if (next.startsWith("/fairs/")) {
    return {
      title: "Sign up to register for this recruitment fair",
      body: "Create your account first — then we'll take you back to complete the fair registration.",
    };
  }
  return null;
}
