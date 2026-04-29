import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveNotificationPrefs } from "@/server/preferences/actions";

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

  const prefs = await db.notificationPreference.findUnique({
    where: { userId: session.user.id },
  }) ?? {
    applicationUpdatesEmail: true, applicationUpdatesSMS: false,
    messagesEmail: true, messagesSMS: false,
    interviewsEmail: true, interviewsSMS: true,
    jobAlertsEmail: true, jobAlertsSMS: false,
    marketingEmail: false,
  };

  return (
    <div className="container max-w-3xl py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-dashboard text-emce-text">Notification preferences</h1>
        <Button asChild variant="outline" size="sm"><Link href="/me">Dashboard →</Link></Button>
      </div>
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
                const emailKey = r.emailField as keyof typeof prefs;
                const smsKey = r.smsField as keyof typeof prefs;
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
                        defaultChecked={Boolean(prefs[emailKey])}
                        className="h-4 w-4 accent-emce-mid"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        name={r.smsField}
                        defaultChecked={Boolean(prefs[smsKey])}
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
                    defaultChecked={prefs.marketingEmail}
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
