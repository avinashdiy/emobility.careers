import { Card } from "@/components/ui/card";
import { SignInTabs } from "@/components/auth/SignInTabs";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n-server";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  return (
    <Card className="p-8">
      <h1 className="text-2xl font-extrabold text-emce-text">{t("auth.signin.title", locale)}</h1>
      <p className="mt-1 text-sm text-emce-text-sec">{t("auth.signin.subtitle", locale)}</p>
      <div className="mt-6">
        <SignInTabs
          next={sp.next}
          passwordTabLabel={t("auth.signin.passwordTab", locale)}
          passwordLabels={{
            email: t("auth.signin.email", locale),
            password: t("auth.signin.password", locale),
            forgot: t("auth.signin.forgot", locale),
            button: t("auth.signin.button", locale),
            pending: t("auth.signin.pending", locale),
            continueWith: t("auth.signin.continueWith", locale),
            newHere: t("auth.signin.newHere", locale),
            createAccount: t("auth.signin.createAccount", locale),
          }}
          magicLinkLabels={{
            tab: t("auth.signin.magicTab", locale),
            email: t("auth.signin.email", locale),
            button: t("auth.signin.magicButton", locale),
            pending: t("auth.signin.magicPending", locale),
            help: t("auth.signin.magicHelp", locale),
          }}
        />
      </div>
    </Card>
  );
}
