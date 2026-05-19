import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { AdminShell } from "@/components/layout/admin-shell";
import { createBroadcast, sendBroadcast, deleteBroadcast } from "@/server/admin/broadcast-actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Broadcasts" };

export default async function BroadcastsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const [broadcasts, segmentCounts, activeFairs] = await Promise.all([
    db.broadcast.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { targetDrive: { select: { title: true, slug: true } } },
    }),
    Promise.all([
      db.user.count({ where: { status: "ACTIVE" } }),
      db.user.count({ where: { status: "ACTIVE", role: "CANDIDATE" } }),
      db.user.count({ where: { status: "ACTIVE", role: "EMPLOYER" } }),
      db.user.count({
        where: { status: "ACTIVE", role: "CANDIDATE", candidateProfile: { isDIYguruVerified: true } },
      }),
      db.user.count({
        where: { status: "ACTIVE", role: "CANDIDATE", candidateProfile: { openToWork: true } },
      }),
    ]),
    // Active fairs feed the FAIR_* audience selector. Limit to
    // OPEN/IN_PROGRESS — broadcasting to a closed fair's audience
    // post-event is occasionally valid (thank-you notes, surveys)
    // but the more common case is in-flight ops, so we surface only
    // the live ones.
    db.recruitmentDrive.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { startsAt: "asc" },
      take: 20,
      select: { id: true, slug: true, title: true, city: true, startsAt: true },
    }),
  ]);

  const [allUsers, allCandidates, allEmployers, diyguru, openToWork] = segmentCounts;

  return (
    <AdminShell>
      <div className="container max-w-4xl py-10">
        <h1 className="text-dashboard text-emce-text">Broadcasts</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Send a platform-wide announcement. In-app notifications fire immediately; email/SMS go through user preferences.
        </p>

        <Card className="mt-6">
          <h2 className="text-section text-emce-text">Compose new broadcast</h2>
          <form action={createBroadcast} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-12">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required maxLength={140} placeholder="e.g. New EV jobs alert: 200+ openings this week" />
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="body">Body</Label>
              <Textarea id="body" name="body" required rows={4} maxLength={2000} />
            </div>
            <div className="sm:col-span-7">
              <Label htmlFor="link">Link (optional)</Label>
              <Input id="link" name="link" type="url" placeholder="/jobs?domain=battery-tech" />
            </div>
            <div className="sm:col-span-5">
              <Label htmlFor="target">Audience</Label>
              <NativeSelect id="target" name="target" defaultValue="ALL_CANDIDATES">
                <optgroup label="Platform-wide">
                  <option value="ALL_USERS">All active users · ~{allUsers.toLocaleString()}</option>
                  <option value="ALL_CANDIDATES">All candidates · ~{allCandidates.toLocaleString()}</option>
                  <option value="ALL_EMPLOYERS">All employers · ~{allEmployers.toLocaleString()}</option>
                  <option value="DIYGURU_VERIFIED">DIYguru verified · ~{diyguru.toLocaleString()}</option>
                  <option value="OPEN_TO_WORK">Open to work · ~{openToWork.toLocaleString()}</option>
                  <option value="EMPLOYERS_VERIFIED">Verified employers</option>
                </optgroup>
                <optgroup label="Fair-scoped (pick a fair below)">
                  <option value="FAIR_REGISTERED_CANDIDATES">Fair candidates</option>
                  <option value="FAIR_REGISTERED_EMPLOYERS">Fair employers</option>
                  <option value="FAIR_REGISTERED_TPOS">Fair TPOs</option>
                  <option value="FAIR_ALL_REGISTRANTS">Fair — everyone</option>
                </optgroup>
              </NativeSelect>
            </div>
            <div className="sm:col-span-12">
              <Label htmlFor="targetDriveId">Fair (required for fair-scoped audiences)</Label>
              <NativeSelect id="targetDriveId" name="targetDriveId" defaultValue="">
                <option value="">— Platform-wide broadcast (no fair) —</option>
                {activeFairs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} · {f.city} · {new Date(f.startsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </option>
                ))}
              </NativeSelect>
              <p className="mt-1 text-hint text-emce-text-muted">
                Only OPEN / IN_PROGRESS fairs are listed. To target a closed fair&apos;s audience (e.g. post-event survey), bump it back to OPEN temporarily.
              </p>
            </div>
            <fieldset className="sm:col-span-12 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <legend className="sr-only">Channels</legend>
              <label className="flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
                <input type="checkbox" disabled checked className="h-4 w-4 accent-emce-mid" />
                In-app (always)
              </label>
              <label className="flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
                <input type="checkbox" name="email" value="true" defaultChecked className="h-4 w-4 accent-emce-mid" />
                Email
              </label>
              <label className="flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
                <input type="checkbox" name="sms" value="true" className="h-4 w-4 accent-emce-mid" />
                SMS (transactional)
              </label>
              <label className="flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
                <input type="checkbox" name="whatsapp" value="true" className="h-4 w-4 accent-emce-mid" />
                WhatsApp
              </label>
            </fieldset>
            <div className="sm:col-span-12 flex flex-wrap justify-end gap-2 border-t border-emce-border pt-3">
              <SubmitButton name="sendNow" value="" variant="outline" pendingLabel="Saving…">
                Save as draft
              </SubmitButton>
              <SubmitButton name="sendNow" value="true" pendingLabel="Queueing…">
                Save &amp; send now
              </SubmitButton>
            </div>
          </form>
        </Card>

        <h2 className="mt-8 text-section text-emce-text">Recent broadcasts</h2>
        {broadcasts.length === 0 ? (
          <Card className="mt-3 p-6 text-center">
            <p className="text-hint text-emce-text-sec">No broadcasts yet.</p>
          </Card>
        ) : (
          <ul className="mt-3 space-y-2">
            {broadcasts.map((b) => (
              <li key={b.id}>
                <Card className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emce-text">{b.title}</span>
                        <Badge variant={
                          b.status === "SENT" ? "success"
                          : b.status === "SENDING" ? "warning"
                          : b.status === "FAILED" ? "danger"
                          : "outline"
                        }>{b.status}</Badge>
                        <Badge variant="default">{b.target.replace(/_/g, " ").toLowerCase()}</Badge>
                        {b.targetDrive && (
                          <Badge variant="outline" size="sm">📅 {b.targetDrive.title}</Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-hint text-emce-text-sec">{b.body}</p>
                      <p className="mt-1 text-hint text-emce-text-muted">
                        {relativeTime(b.createdAt)} · {b.recipientCount.toLocaleString()} recipients · {b.sentCount.toLocaleString()} sent
                        {b.failedCount > 0 ? ` · ${b.failedCount} failed` : ""}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      {b.status === "DRAFT" && (
                        <form action={sendBroadcast}>
                          <input type="hidden" name="id" value={b.id} />
                          <SubmitButton size="sm" pendingLabel="Queueing…">Send now</SubmitButton>
                        </form>
                      )}
                      {b.status !== "SENDING" && (
                        <form action={deleteBroadcast}>
                          <input type="hidden" name="id" value={b.id} />
                          <ConfirmSubmit confirm="Delete this broadcast record?" size="sm" variant="ghost">
                            Delete
                          </ConfirmSubmit>
                        </form>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
