import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { saveNotificationPrefs } from "@/server/preferences/actions";
import { confirmCountry } from "@/server/account/country-actions";
import { SUPPORTED_COUNTRY_LIST, SUPPORTED_COUNTRIES } from "@/lib/countries";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Notification preferences" };

const ROWS: { key: string; emailField: string; smsField: string; label: string; description: string }[] = [
  {
    key: "applicationUpdates",
    emailField: "applicationUpdatesEmail",
    smsField: "applicationUpdatesSMS",
    label: "Application updates",
    description: "Stage changes, recruiter messages on your applications.",
  },
  {
    key: "messages",
    emailField: "messagesEmail",
    smsField: "messagesSMS",
    label: "New messages",
    description: "Direct messages from recruiters.",
  },
  {
    key: "interviews",
    emailField: "interviewsEmail",
    smsField: "interviewsSMS",
    label: "Interview reminders",
    description: "Scheduled, rescheduled, cancelled, and same-day reminders.",
  },
  {
    key: "jobAlerts",
    emailField: "jobAlertsEmail",
    smsField: "jobAlertsSMS",
    label: "Job alerts",
    description: "New jobs matching your saved searches.",
  },
];

export default async function PreferencesPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/preferences");

  const [prefs, user] = await Promise.all([
    db.notificationPreference.findUnique({
      where: { userId: session.user.id },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { country: true, countryConfirmedAt: true },
    }),
  ]);
  const effectivePrefs = prefs ?? {
    applicationUpdatesEmail: true, applicationUpdatesSMS: false,
    messagesEmail: true, messagesSMS: false,
    interviewsEmail: true, interviewsSMS: true,
    jobAlertsEmail: true, jobAlertsSMS: false,
    marketingEmail: false,
  };
  const currentCountry = user?.country ?? "IN";

  return (
    <div className="container max-w-3xl py-10">
      <ToastFromSearchParams />
      <div className="flex items-center justify-between">
        <h1 className="text-dashboard text-emce-text">Account preferences</h1>
        <Button asChild variant="outline" size="sm"><Link href="/me">Dashboard →</Link></Button>
      </div>
      <p className="mt-1 text-sm text-emce-text-sec">
        Country, language, and notification settings for your account.
      </p>

      {/* ── Country card (PR 7) ──
          User-facing version of the ConfirmCountryBanner — lets
          them change country AFTER the initial confirmation
          without needing to wait for a banner to re-appear. Uses
          the same `confirmCountry` server action so writes the
          same columns (User.country + User.countryConfirmedAt +
          emce_country cookie) and the rest of the platform
          (currency display, GSC routing, "trending in your
          country" feed lens) honours it consistently. */}
      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-section text-emce-text">
              <span aria-hidden className="mr-1">
                {SUPPORTED_COUNTRIES[currentCountry].flag}
              </span>
              Country
            </h2>
            <p className="mt-1 text-hint text-emce-text-sec">
              Drives currency display on jobs, default time-zone for
              interviews, and the "same country" lens on People &
              Companies discovery. Changing this also updates the
              country chip in the header on your next page load.
            </p>
            {user?.countryConfirmedAt && (
              <p className="mt-1 text-[11px] text-emce-text-muted">
                Last confirmed {relativeTime(user.countryConfirmedAt)}.
              </p>
            )}
          </div>
        </div>
        <form action={confirmCountry} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="returnTo" value="/me/preferences" />
          <div className="min-w-[200px] flex-1">
            <label
              htmlFor="country"
              className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-emce-text-muted"
            >
              Your country
            </label>
            <NativeSelect
              id="country"
              name="country"
              defaultValue={currentCountry}
            >
              {SUPPORTED_COUNTRY_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit">Save country</Button>
        </form>
      </Card>

      <h2 className="mt-10 text-section text-emce-text">Notification preferences</h2>
      <p className="mt-1 text-sm text-emce-text-sec">
        Choose how we reach you. In-app notifications always show in your inbox.
      </p>

      <Card className="mt-6 overflow-x-auto p-0">
        <form action={saveNotificationPrefs}>
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th className="p-3">Event</th>
                <th className="w-24 p-3 text-center">Email</th>
                <th className="w-24 p-3 text-center">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {ROWS.map((r) => {
                const emailKey = r.emailField as keyof typeof effectivePrefs;
                const smsKey = r.smsField as keyof typeof effectivePrefs;
                return (
                  <tr key={r.key}>
                    <td className="p-3">
                      <div className="font-bold text-emce-text">{r.label}</div>
                      <div className="text-hint text-emce-text-sec">{r.description}</div>
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        name={r.emailField}
                        defaultChecked={Boolean(effectivePrefs[emailKey])}
                        className="h-4 w-4 accent-emce-mid"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        name={r.smsField}
                        defaultChecked={Boolean(effectivePrefs[smsKey])}
                        className="h-4 w-4 accent-emce-mid"
                      />
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="p-3">
                  <div className="font-bold text-emce-text">Marketing emails</div>
                  <div className="text-hint text-emce-text-sec">Product updates, EV-industry insights.</div>
                </td>
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    name="marketingEmail"
                    defaultChecked={effectivePrefs.marketingEmail}
                    className="h-4 w-4 accent-emce-mid"
                  />
                </td>
                <td className="p-3 text-center text-emce-text-muted">—</td>
              </tr>
            </tbody>
          </table>
          <div className="flex justify-end border-t border-emce-border p-4">
            <Button type="submit">Save preferences</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
