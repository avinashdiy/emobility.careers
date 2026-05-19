import { Card } from "@/components/ui/card";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { turnstilePublicKey } from "@/lib/anti-spam";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const metadata = {
  title: "Create your account",
  description:
    "Create your eMobility Careers account — India's specialised EV-industry hiring platform. Apply to battery, charging, powertrain, and motor-engineering roles.",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const defaultRole = sp.role === "EMPLOYER" ? "EMPLOYER" : "CANDIDATE";
  const locale = await getLocale();

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">{t("auth.signup.title", locale)}</h1>
      <p className="mt-1 text-sm text-emce-text-sec">{t("auth.signup.subtitle", locale)}</p>
      <div className="mt-6">
        <SignUpForm
          defaultRole={defaultRole}
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
