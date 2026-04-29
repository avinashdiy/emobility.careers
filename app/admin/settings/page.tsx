import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Database, Mail, Brain, CreditCard, Globe, Shield, Search, Calendar, Cloud, MessageSquare,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { SETTING_DEFINITIONS, getAllSettings } from "@/lib/settings";

export const metadata = { title: "Settings" };

const TABS = [
  { value: "identity", label: "Identity" },
  { value: "email", label: "Email" },
  { value: "feature", label: "Features" },
  { value: "system", label: "Maintenance" },
  { value: "seo", label: "SEO" },
  { value: "legal", label: "Legal" },
  { value: "payments", label: "Payments" },
  { value: "social", label: "Moderation" },
  { value: "realtime", label: "Realtime" },
  { value: "calendar", label: "Calendar" },
  { value: "admin", label: "Admin" },
  { value: "integrations", label: "Integrations" },
] as const;
type Tab = typeof TABS[number]["value"];

// Auth credentials live on a dedicated page (/admin/settings/auth)
// rather than as a tab here because the page bundles a step-by-step
// Google + LinkedIn setup guide and the redirect URLs admins need to
// register — none of which fit cleanly into the tabbed-form layout.
const AUTH_LINK = { href: "/admin/settings/auth", label: "Sign-in providers" };

const CATEGORY_BLURB: Record<string, string> = {
  identity: "How your platform shows up in browsers, emails, and search engines.",
  email: "Sender identity and signature appended to every transactional email.",
  feature: "Kill switches for the four pillars. Use these for staged rollouts or emergencies.",
  system: "Maintenance windows and global banners that appear at the top of every page.",
  seo: "Search-engine and social-share metadata defaults.",
  legal: "Links to your published Terms, Privacy, and Cookie policies.",
  payments: "Razorpay defaults and platform fee. Currency-related changes apply to new orders only.",
  social: "Anti-spam thresholds for the social feed. Tighten if you see abuse.",
  realtime: "Soketi (Pusher-protocol) credentials for chat + ATS live updates. The server reads SOKETI_* env vars on boot — values saved here mirror the live config; restart the web container after changing.",
  calendar: "Google Calendar OAuth for the interview-sync feature. Save the credentials here to prepare; the sync worker activates them in a follow-up release. Until then, every scheduled interview ships with an ICS download fallback.",
  admin: "Admin-tier defaults — alert routing, audit-log retention, account lockout thresholds.",
};

function probe(varName: string): boolean {
  const v = process.env[varName];
  return Boolean(v && v.trim() && !v.startsWith("change_") && !v.startsWith("your-"));
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: Tab }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const sp = await searchParams;
  const tab: Tab = sp.tab && TABS.some((t) => t.value === sp.tab) ? sp.tab : "identity";

  const values = await getAllSettings();

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <h1 className="text-dashboard text-emce-text md:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Edit the soft settings here. API keys and database URLs stay in <code className="rounded bg-emce-light-soft px-1">.env</code> on the host — see the Integrations tab for status.
          </p>
        </header>

        <nav className="mb-4 flex flex-wrap gap-1 rounded-md border border-emce-border p-1">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={`/admin/settings?tab=${t.value}`}
              className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold ${t.value === tab ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
            >
              {t.label}
            </Link>
          ))}
          {/* Sign-in providers — link out to the dedicated page since it
              ships a setup guide that wouldn't fit a tab. */}
          <Link
            href={AUTH_LINK.href}
            className="whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold text-emce-text-sec hover:text-emce-text"
          >
            {AUTH_LINK.label} ↗
          </Link>
        </nav>

        {tab === "integrations" ? (
          <IntegrationsView />
        ) : (
          (() => {
            const definitions = SETTING_DEFINITIONS.filter((d) => d.category === tab);
            const titleByTab: Record<string, string> = {
              identity: "Site identity",
              email: "Email defaults",
              feature: "Feature flags",
              system: "Maintenance & banners",
              seo: "SEO defaults",
              legal: "Legal links",
              payments: "Payments",
              social: "Social moderation",
              realtime: "Realtime / Soketi",
              calendar: "Google Calendar",
              admin: "Admin defaults",
            };
            return (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <SettingsForm
                    category={tab}
                    title={titleByTab[tab] ?? tab}
                    description={CATEGORY_BLURB[tab]}
                    definitions={definitions}
                    values={values}
                  />
                </div>
                <aside className="space-y-6">
                  <Card className="bg-emce-light-soft">
                    <h3 className="text-section text-emce-text">Tips</h3>
                    {tab === "feature" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Toggling off a feature hides its routes (links and pages return a friendly fallback) but does not delete data. Existing posts/competitions/sessions stay queryable.
                      </p>
                    )}
                    {tab === "system" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Maintenance mode shows a friendly page to visitors but keeps <code>/admin</code> reachable so you can flip it off without SSH.
                      </p>
                    )}
                    {tab === "email" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        The signature is appended to every email body — keep it short. Reply-To overrides the from address; useful when you send from <em>noreply@</em> but want replies routed to support.
                      </p>
                    )}
                    {tab === "identity" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Site name + tagline cascade into <code>&lt;title&gt;</code> tags, OG metadata, and email subjects. Changes take effect on the next page render (cache TTL ~30s).
                      </p>
                    )}
                    {tab === "payments" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Platform fee is applied at booking time — existing sessions are unaffected. Setting to <code>0</code> keeps the v1 "no fee" promise.
                      </p>
                    )}
                    {tab === "realtime" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        These mirror the <code>SOKETI_*</code> env vars on the server. The Pusher client bootstraps once at module-init, so changes here apply on next deploy / web container restart. The browser-side public key is bundled at build time — also requires a redeploy.
                      </p>
                    )}
                    {tab === "calendar" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Reuse the same Google Cloud OAuth client as <Link href="/admin/settings/auth" className="font-bold text-emce-dark hover:underline">sign-in</Link>; just add the <code>https://www.googleapis.com/auth/calendar.events</code> scope to the consent screen and enable the Calendar API in the project. Sync activates when the upcoming worker ships.
                      </p>
                    )}
                    {tab === "admin" && (
                      <p className="mt-2 text-sm text-emce-text-sec">
                        Notification email gets the security + ops alerts that aren&apos;t worth a Slack channel of their own. Audit retention runs nightly — bumping it up just means more rows; bumping down purges immediately on the next cron tick.
                      </p>
                    )}
                  </Card>
                </aside>
              </div>
            );
          })()
        )}
      </div>
    </AdminShell>
  );
}

async function IntegrationsView() {
  const dbStatus = await db.$queryRaw`SELECT 1`.then(
    () => ({ ok: true } as const),
    (err: Error) => ({ ok: false, error: err.message } as const),
  );
  const redisStatus = await redis.ping().then(
    () => ({ ok: true } as const),
    (err: Error) => ({ ok: false, error: err.message } as const),
  );

  interface Integration {
    name: string;
    configured: boolean;
    notes?: string;
    icon: React.ComponentType<{ className?: string }>;
    configUrl?: string;
    envKeys: string[];
  }

  const integrations: Integration[] = [
    { name: "PostgreSQL", configured: dbStatus.ok, notes: dbStatus.ok ? "Reachable" : `Unreachable: ${dbStatus.error?.slice(0, 80)}`, icon: Database, envKeys: ["DATABASE_URL"] },
    { name: "Redis", configured: redisStatus.ok, notes: redisStatus.ok ? "Reachable" : `Unreachable: ${redisStatus.error?.slice(0, 80)}`, icon: Database, envKeys: ["REDIS_URL"] },
    { name: "OpenAI", configured: probe("OPENAI_API_KEY"), notes: probe("OPENAI_API_KEY") ? "Set" : "Resume parsing + matching disabled", icon: Brain, configUrl: "https://platform.openai.com/api-keys", envKeys: ["OPENAI_API_KEY"] },
    { name: "Amazon SES (primary email)", configured: probe("AWS_SES_REGION") && probe("AWS_SES_ACCESS_KEY_ID") && probe("AWS_SES_SECRET_ACCESS_KEY"), notes: probe("AWS_SES_ACCESS_KEY_ID") ? "Set — sending via SES" : "Magic-link + transactional email disabled", icon: Mail, configUrl: "https://console.aws.amazon.com/ses", envKeys: ["AWS_SES_REGION", "AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY"] },
    { name: "Resend (fallback email)", configured: probe("RESEND_API_KEY"), notes: probe("RESEND_API_KEY") ? "Set — used only if SES is unset" : "Optional fallback for dev/staging", icon: Mail, configUrl: "https://resend.com/api-keys", envKeys: ["RESEND_API_KEY"] },
    { name: "MSG91 (SMS)", configured: probe("MSG91_AUTH_KEY"), notes: probe("MSG91_AUTH_KEY") ? "Set" : "OTP + reminders disabled", icon: MessageSquare, configUrl: "https://control.msg91.com", envKeys: ["MSG91_AUTH_KEY"] },
    { name: "Razorpay", configured: probe("RAZORPAY_KEY_ID") && probe("RAZORPAY_KEY_SECRET"), notes: probe("RAZORPAY_WEBHOOK_SECRET") ? "Live + webhook" : probe("RAZORPAY_KEY_ID") ? "Keys set, webhook missing" : "Stub orders only", icon: CreditCard, configUrl: "https://dashboard.razorpay.com", envKeys: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"] },
    { name: "MinIO / S3", configured: probe("S3_ACCESS_KEY") && probe("S3_SECRET_KEY"), notes: "File storage", icon: Cloud, envKeys: ["S3_ENDPOINT", "S3_ACCESS_KEY"] },
    { name: "Soketi", configured: probe("SOKETI_APP_KEY"), icon: Cloud, envKeys: ["SOKETI_APP_KEY"] },
    { name: "Google OAuth", configured: probe("AUTH_GOOGLE_ID"), icon: Globe, envKeys: ["AUTH_GOOGLE_ID"] },
    { name: "LinkedIn OAuth", configured: probe("AUTH_LINKEDIN_ID"), icon: Globe, envKeys: ["AUTH_LINKEDIN_ID"] },
    { name: "DIYguru", configured: probe("DIYGURU_API_KEY"), icon: Shield, envKeys: ["DIYGURU_API_KEY"] },
    { name: "Google Indexing", configured: probe("GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY"), icon: Search, configUrl: "https://developers.google.com/search/apis/indexing-api/v3/prereqs", envKeys: ["GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY"] },
    { name: "IndexNow", configured: probe("INDEXNOW_KEY"), icon: Search, configUrl: "https://www.indexnow.org/", envKeys: ["INDEXNOW_KEY"] },
    { name: "Sentry", configured: probe("SENTRY_DSN"), icon: Shield, envKeys: ["SENTRY_DSN"] },
    { name: "Google Calendar", configured: false, notes: "OAuth not wired — ICS download fallback", icon: Calendar, envKeys: [] },
  ];

  const okCount = integrations.filter((i) => i.configured).length;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-section text-emce-text">Integration health</h2>
        <Badge variant={okCount === integrations.length ? "verified" : "warning"}>
          {okCount} / {integrations.length} configured
        </Badge>
      </div>
      <p className="mt-1 text-hint text-emce-text-sec">Read-only. API keys are managed in env vars on the host.</p>
      <ul className="mt-4 divide-y divide-emce-border">
        {integrations.map((i) => {
          const Icon = i.icon;
          return (
            <li key={i.name} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emce-light-soft text-emce-darkest">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emce-text">{i.name}</span>
                  <Badge variant={i.configured ? "verified" : "outline"} className="text-[10px]">
                    {i.configured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                {i.notes && <p className="mt-0.5 text-hint text-emce-text-sec">{i.notes}</p>}
                {i.envKeys.length > 0 && (
                  <p className="mt-1 font-mono text-[10px] text-emce-text-sec">{i.envKeys.join(" · ")}</p>
                )}
              </div>
              {i.configUrl && (
                <a href={i.configUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emce-dark hover:underline">
                  Open dashboard →
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
