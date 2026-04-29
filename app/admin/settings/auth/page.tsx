import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { SETTING_DEFINITIONS, getAllSettings } from "@/lib/settings";

export const metadata = { title: "OAuth & sign-in providers" };

/**
 * /admin/settings/auth — Google + LinkedIn OAuth credentials, plus an
 * inline setup guide. The form posts to the existing `saveSettings`
 * action with category=auth, which writes the four `auth.*` keys to
 * the SiteSetting table. lib/auth.ts reads them at sign-in time and
 * falls back to the AUTH_GOOGLE_* / AUTH_LINKEDIN_* env vars when
 * the settings are empty.
 *
 * Side effect of saving: the in-memory settings cache (TTL 30s) is
 * invalidated, so the next sign-in flow picks up the new credentials
 * without a redeploy.
 */
export default async function AuthSettingsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const values = await getAllSettings();
  const authDefs = SETTING_DEFINITIONS.filter((d) => d.category === "auth");

  // The platform's canonical URL — what NextAuth uses when assembling
  // OAuth redirect URLs. Pasting the wrong one into Google / LinkedIn
  // is by far the most common setup mistake, so we surface it
  // prominently and split it into the two callback URLs the admin
  // actually needs to register.
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const googleCallback = `${base}/api/auth/callback/google`;
  const linkedinCallback = `${base}/api/auth/callback/linkedin`;
  const homepageUrl = base;

  // Resolve "configured" status from settings → env → not configured.
  const googleConfigured = Boolean(
    (values["auth.google.client_id"]?.trim() || process.env.AUTH_GOOGLE_ID) &&
      (values["auth.google.client_secret"]?.trim() || process.env.AUTH_GOOGLE_SECRET),
  );
  const linkedinConfigured = Boolean(
    (values["auth.linkedin.client_id"]?.trim() || process.env.AUTH_LINKEDIN_ID) &&
      (values["auth.linkedin.client_secret"]?.trim() || process.env.AUTH_LINKEDIN_SECRET),
  );

  return (
    <AdminShell>
      <div className="container max-w-4xl space-y-6 py-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-dashboard text-emce-text">OAuth & sign-in providers</h1>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Configure Google and LinkedIn one-tap sign-in. Paste your
              client credentials below and they apply on the very next
              sign-in flow — no redeploy.
            </p>
          </div>
          <Link
            href="/admin/settings"
            className="shrink-0 text-sm font-bold text-emce-dark hover:underline"
          >
            ← Back to settings
          </Link>
        </div>

        {/* Status row — what's actually live right now */}
        <Card>
          <h2 className="text-section text-emce-text">Current status</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="font-bold text-emce-text">Google</span>
              <Badge variant={googleConfigured ? "success" : "outline"}>
                {googleConfigured ? "✓ Configured" : "Not configured"}
              </Badge>
            </li>
            <li className="flex items-center justify-between">
              <span className="font-bold text-emce-text">LinkedIn</span>
              <Badge variant={linkedinConfigured ? "success" : "outline"}>
                {linkedinConfigured ? "✓ Configured" : "Not configured"}
              </Badge>
            </li>
          </ul>
          <p className="mt-3 text-hint text-emce-text-sec">
            A provider counts as configured when both Client ID and
            Client Secret are present (in settings below, or in the
            corresponding <code>AUTH_*</code> environment variables).
            Unconfigured providers are simply hidden from the sign-in
            page — the rest of sign-in (email/password, magic link)
            keeps working.
          </p>
        </Card>

        {/* Callback URLs — the most common setup mistake */}
        <Card>
          <h2 className="text-section text-emce-text">Redirect URIs to register</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Paste these into the OAuth client config in Google Cloud
            Console / LinkedIn Developers <em>before</em> you save the
            credentials below. If the URI doesn&apos;t match, sign-in
            fails with{" "}
            <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
              redirect_uri_mismatch
            </code>
            .
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
              <dt className="font-bold text-emce-text">Authorized JavaScript origin</dt>
              <dd className="min-w-0 break-all font-mono text-emce-text-sec">{homepageUrl}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
              <dt className="font-bold text-emce-text">Google redirect URI</dt>
              <dd className="min-w-0 break-all font-mono text-emce-text-sec">{googleCallback}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
              <dt className="font-bold text-emce-text">LinkedIn redirect URL</dt>
              <dd className="min-w-0 break-all font-mono text-emce-text-sec">{linkedinCallback}</dd>
            </div>
          </dl>
        </Card>

        {/* The form */}
        <SettingsForm
          category="auth"
          title="Provider credentials"
          description="Stored in the SiteSetting table. Treat the secrets like passwords — never paste into a public chat."
          definitions={authDefs}
          values={values}
        />

        {/* Setup guides — collapsible so the page stays focused on
            the form, but the steps are one click away when they're
            needed. */}
        <Card className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between p-6 text-section font-extrabold text-emce-text">
              <span>How to get Google credentials</span>
              <span className="text-emce-text-sec group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="border-t border-emce-border px-6 py-4 text-sm text-emce-text-sec">
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  Open{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emce-dark hover:underline"
                  >
                    console.cloud.google.com → APIs &amp; Services → Credentials
                  </a>
                  . If you don&apos;t have a project yet, create one
                  (any name is fine — &quot;eMobility Careers&quot;
                  works).
                </li>
                <li>
                  Click <strong>OAuth consent screen</strong> in the
                  left rail, choose <strong>External</strong>, and fill
                  in the app name, support email, and developer email.
                  You&apos;ll need a privacy policy URL and homepage
                  URL — point them at{" "}
                  <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
                    {homepageUrl}/privacy
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
                    {homepageUrl}
                  </code>
                  . Add the scopes <code>email</code>,{" "}
                  <code>profile</code>, and <code>openid</code>.
                </li>
                <li>
                  Back in <strong>Credentials</strong>, click{" "}
                  <strong>+ Create credentials → OAuth client ID</strong>.
                  Choose <strong>Web application</strong>.
                </li>
                <li>
                  Under <em>Authorized JavaScript origins</em>, paste:{" "}
                  <code className="break-all rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
                    {homepageUrl}
                  </code>
                </li>
                <li>
                  Under <em>Authorized redirect URIs</em>, paste:{" "}
                  <code className="break-all rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
                    {googleCallback}
                  </code>
                </li>
                <li>
                  Hit <strong>Create</strong>. Copy the{" "}
                  <strong>Client ID</strong> (looks like{" "}
                  <code>1234-abc.apps.googleusercontent.com</code>) and{" "}
                  <strong>Client Secret</strong> into the form above.
                </li>
                <li>
                  While in <strong>Testing</strong> mode, only users
                  you add as test users can sign in. To open it up to
                  everyone, click <strong>Publish app</strong> on the
                  consent screen.
                </li>
              </ol>
            </div>
          </details>
        </Card>

        <Card className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between p-6 text-section font-extrabold text-emce-text">
              <span>How to get LinkedIn credentials</span>
              <span className="text-emce-text-sec group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="border-t border-emce-border px-6 py-4 text-sm text-emce-text-sec">
              <ol className="list-decimal space-y-3 pl-5">
                <li>
                  Open{" "}
                  <a
                    href="https://www.linkedin.com/developers/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emce-dark hover:underline"
                  >
                    linkedin.com/developers/apps
                  </a>{" "}
                  and click <strong>Create app</strong>. You&apos;ll
                  need a LinkedIn Page for your company associated with
                  the app — create one first if you don&apos;t have it.
                </li>
                <li>
                  Fill in the app name, the Page, and a square
                  app-logo image (LinkedIn requires this — minimum
                  100×100). Accept the API terms.
                </li>
                <li>
                  Open the new app, go to <strong>Auth</strong> tab.
                  Under <em>OAuth 2.0 settings → Authorized redirect URLs for your app</em>,
                  click <strong>Add redirect URL</strong> and paste:{" "}
                  <code className="break-all rounded bg-emce-light-soft px-1 py-0.5 text-[12px]">
                    {linkedinCallback}
                  </code>
                </li>
                <li>
                  Under <strong>Products</strong>, request{" "}
                  <em>Sign In with LinkedIn using OpenID Connect</em>.
                  Approval is typically instant.
                </li>
                <li>
                  Back on the <strong>Auth</strong> tab, copy the{" "}
                  <strong>Client ID</strong> and{" "}
                  <strong>Client Secret</strong> into the form above.
                </li>
                <li>
                  LinkedIn apps default to a <em>Development</em> mode
                  that only lets the app owner sign in. Switch to{" "}
                  <strong>Live</strong> from the Settings tab once
                  you&apos;re ready for public sign-ins.
                </li>
              </ol>
            </div>
          </details>
        </Card>
      </div>
    </AdminShell>
  );
}
