import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  upsertAnnouncement,
  toggleAnnouncementActive,
  deleteAnnouncement,
} from "@/server/admin/announcement-actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Announcements" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE = {
  INFO: "outline",
  SUCCESS: "success",
  WARNING: "warning",
  CRITICAL: "danger",
} as const;

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const announcements = await db.announcement.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true, email: true } } },
  });

  return (
    <AdminShell>
      <div className="container max-w-4xl py-10">
        <h1 className="text-dashboard text-emce-text">Announcements</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Site-wide banners with severity, audience targeting, scheduled
          windows, and an optional CTA. The highest-severity active
          announcement renders at the top of every page for users in the
          target audience.
        </p>

        {sp.error && (
          <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">New announcement</h2>
          <form action={upsertAnnouncement} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-12">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" placeholder="We're at the EV Expo" required maxLength={120} />
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                name="body"
                rows={3}
                required
                maxLength={2000}
                placeholder="Booth A12, Bombay Exhibition Centre, Jan 12–14. Drop by for a demo."
              />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="severity">Severity</Label>
              <NativeSelect id="severity" name="severity" defaultValue="INFO">
                <option value="INFO">Info</option>
                <option value="SUCCESS">Success</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="audience">Audience</Label>
              <NativeSelect id="audience" name="audience" defaultValue="EVERYONE">
                <option value="EVERYONE">Everyone</option>
                <option value="CANDIDATES">Candidates</option>
                <option value="EMPLOYERS">Employers</option>
                <option value="ADMINS">Admins</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="startsAt">Starts at (optional)</Label>
              <Input id="startsAt" name="startsAt" type="datetime-local" />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="endsAt">Ends at (optional)</Label>
              <Input id="endsAt" name="endsAt" type="datetime-local" />
            </div>
            <div className="sm:col-span-6">
              <Label htmlFor="ctaLabel">CTA label (optional)</Label>
              <Input id="ctaLabel" name="ctaLabel" placeholder="Get directions" maxLength={40} />
            </div>
            <div className="sm:col-span-6">
              <Label htmlFor="ctaUrl">CTA URL (optional)</Label>
              <Input id="ctaUrl" name="ctaUrl" placeholder="/events/ev-expo-2026" maxLength={500} />
            </div>
            <div className="sm:col-span-12 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" value="true" defaultChecked />
                <span className="font-bold text-emce-text">Active</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="dismissible" value="true" defaultChecked />
                <span className="font-bold text-emce-text">Dismissible</span>
              </label>
              <Button type="submit" className="ml-auto">Publish</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">All announcements</h2>
          {announcements.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">No announcements.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {announcements.map((a) => (
                <li
                  key={a.id}
                  className="rounded-md border border-emce-border p-3"
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-bold text-emce-text">{a.title}</span>
                    <Badge variant={SEVERITY_TONE[a.severity]}>{a.severity}</Badge>
                    <Badge variant="outline">{a.audience}</Badge>
                    {a.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="warning">Disabled</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-hint text-emce-text-sec">{a.body}</p>
                  <p className="mt-1 text-hint text-emce-text-muted">
                    {a.startsAt && <>From {a.startsAt.toLocaleString()} </>}
                    {a.endsAt && <>until {a.endsAt.toLocaleString()} </>}
                    · created {relativeTime(a.createdAt)} by{" "}
                    {a.createdBy.name ?? a.createdBy.email}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={toggleAnnouncementActive}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" size="sm" variant="outline">
                        {a.isActive ? "Disable" : "Enable"}
                      </Button>
                    </form>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmSubmit
                        size="sm"
                        variant="ghost"
                        confirm={`Delete "${a.title}"? Removed permanently.`}
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
