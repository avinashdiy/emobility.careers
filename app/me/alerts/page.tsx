import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { createJobAlert, deleteJobAlert, toggleJobAlert } from "@/server/alerts/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Job alerts" };

export default async function AlertsPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/alerts");
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const [alerts, evDomains] = await Promise.all([
    db.jobAlert.findMany({
      where: { candidateId: profile.id },
      orderBy: { createdAt: "desc" },
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <div className="container max-w-3xl py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-dashboard text-emce-text">Job alerts</h1>
        <Button asChild variant="outline" size="sm"><Link href="/me">Dashboard</Link></Button>
      </div>
      <p className="mt-1 text-sm text-emce-text-sec">
        Get pinged when new EV jobs match your search. We&apos;ll send a digest based on your frequency.
      </p>

      <Card className="mt-6">
        <h2 className="text-section text-emce-text">Create an alert</h2>
        <form action={createJobAlert} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-7">
            <Label htmlFor="query">Search query</Label>
            <Input id="query" name="query" required maxLength={200} placeholder="e.g. battery pack engineer Bengaluru" />
          </div>
          <div className="sm:col-span-5">
            <Label htmlFor="domain">EV domain</Label>
            <NativeSelect id="domain" name="domain" defaultValue="">
              <option value="">Any domain</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="workMode">Work mode</Label>
            <NativeSelect id="workMode" name="workMode" defaultValue="">
              <option value="">Any</option>
              <option value="ONSITE">On-site</option>
              <option value="REMOTE">Remote</option>
              <option value="HYBRID">Hybrid</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="profileMode">Profile mode</Label>
            <NativeSelect id="profileMode" name="profileMode" defaultValue="">
              <option value="">Any</option>
              <option value="FRESHER">Fresher</option>
              <option value="EXPERIENCED">Experienced</option>
              <option value="TECHNICIAN">Technician</option>
              <option value="LEADERSHIP">Leadership</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="location">Location</Label>
            <Input id="location" name="location" placeholder="e.g. Pune" />
          </div>
          <div className="sm:col-span-3">
            <Label htmlFor="frequency">Frequency</Label>
            <NativeSelect id="frequency" name="frequency" defaultValue="daily">
              <option value="instant">Instant</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </NativeSelect>
          </div>
          <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
            <input type="checkbox" name="email" value="true" defaultChecked className="h-4 w-4 accent-emce-mid" />
            Email
          </label>
          <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
            <input type="checkbox" name="sms" value="true" className="h-4 w-4 accent-emce-mid" />
            SMS
          </label>
          <div className="sm:col-span-6 flex items-end justify-end">
            <SubmitButton pendingLabel="Saving…">Create alert</SubmitButton>
          </div>
        </form>
      </Card>

      <h2 className="mt-8 text-section text-emce-text">Your alerts ({alerts.length})</h2>
      {alerts.length === 0 ? (
        <Card className="mt-3 p-6 text-center">
          <p className="text-hint text-emce-text-sec">No alerts yet — create one above.</p>
        </Card>
      ) : (
        <ul className="emce-stagger mt-3 space-y-2">
          {alerts.map((a) => (
            <li key={a.id}>
              <Card className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emce-text">{a.query}</span>
                      <Badge variant={a.isActive ? "success" : "outline"}>
                        {a.isActive ? "Active" : "Paused"}
                      </Badge>
                      <Badge variant="default">{a.frequency}</Badge>
                    </div>
                    <p className="text-hint text-emce-text-sec">
                      {a.channels.join(" · ")} · created {relativeTime(a.createdAt)}
                      {a.lastSentAt ? ` · last sent ${relativeTime(a.lastSentAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={toggleJobAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="isActive" value={a.isActive ? "false" : "true"} />
                      <Button type="submit" size="sm" variant="outline">
                        {a.isActive ? "Pause" : "Resume"}
                      </Button>
                    </form>
                    <form action={deleteJobAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmSubmit
                        confirm="Delete this alert?"
                        size="sm"
                        variant="ghost"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
