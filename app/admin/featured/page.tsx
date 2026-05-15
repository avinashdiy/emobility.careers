import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import {
  featureCandidate,
  unfeatureCandidate,
} from "@/server/featured/actions";
import { startOfThisWeekIST } from "@/server/featured/week";

export const metadata = { title: "Featured this week" };

/**
 * Admin curation page for the Featured This Week spotlight. Shows the
 * five tiles for the current week with current occupants + a form per
 * tile to set/replace. Slots without a candidate render an empty
 * dashed tile with the form inlined.
 */
export default async function AdminFeaturedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const weekStart = startOfThisWeekIST();

  const slots = await db.featuredSlot.findMany({
    where: { weekStart, isActive: true },
    orderBy: { position: "asc" },
    include: {
      candidate: {
        select: {
          slug: true,
          firstName: true,
          lastName: true,
          headline: true,
          profilePhotoUrl: true,
          isDIYguruVerified: true,
        },
      },
    },
  });
  const occupied = new Map(slots.map((s) => [s.position, s]));
  const positions = [1, 2, 3, 4, 5];
  const weekLabel = weekStart.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <AdminShell>
      <div className="container max-w-5xl space-y-6 py-10">
        <PageHeader
          eyebrow="Marketing"
          title="Featured this week"
          subtitle={`Five candidate spotlights surfaced on the home page + Pulse · week starting ${weekLabel}`}
        />

        {sp.error && (
          <div className="rounded-md border border-emce-red bg-emce-red-light p-3 text-sm text-emce-red-deep">
            ⚠️ {sp.error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map((pos) => {
            const slot = occupied.get(pos);
            return (
              <Card key={pos} className={slot ? "" : "border-dashed"}>
                <SectionTitle title={`Slot ${pos}`} />
                {slot ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={slot.imageUrl ?? slot.candidate.profilePhotoUrl}
                        name={`${slot.candidate.firstName} ${slot.candidate.lastName ?? ""}`}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/${slot.candidate.slug}`}
                          className="block truncate font-bold text-emce-text hover:underline"
                        >
                          {slot.candidate.firstName} {slot.candidate.lastName ?? ""}
                          {slot.candidate.isDIYguruVerified && (
                            <Badge variant="verified" className="ml-1 text-[10px]">⭐</Badge>
                          )}
                        </Link>
                        {slot.candidate.headline && (
                          <p className="line-clamp-1 text-hint text-emce-text-sec">
                            {slot.candidate.headline}
                          </p>
                        )}
                      </div>
                    </div>
                    {slot.spotlightReason && (
                      <p className="rounded-md bg-emce-light-soft p-2 text-hint italic text-emce-text-sec">
                        “{slot.spotlightReason}”
                      </p>
                    )}
                    <form action={unfeatureCandidate}>
                      <input type="hidden" name="slotId" value={slot.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Remove from spotlight
                      </Button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-3 text-hint text-emce-text-sec">Open · pick a candidate below.</p>
                )}

                <details className={`mt-3 rounded-md border ${slot ? "border-emce-border" : "border-emce-border"}`}>
                  <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-emce-dark">
                    {slot ? "Replace" : "Set candidate"}
                  </summary>
                  <form action={featureCandidate} className="space-y-2 p-3 pt-0">
                    <input type="hidden" name="position" value={pos} />
                    <input type="hidden" name="weekStart" value={weekStart.toISOString()} />
                    <div>
                      <Label htmlFor={`slug-${pos}`}>Candidate username (slug)</Label>
                      <Input
                        id={`slug-${pos}`}
                        name="candidateSlug"
                        required
                        placeholder="e.g. anita-kumar"
                        defaultValue={slot?.candidate.slug ?? ""}
                      />
                      <p className="mt-1 text-hint text-emce-text-muted">
                        Must be a public profile (cvVisibility = EVERYONE).
                      </p>
                    </div>
                    <div>
                      <Label htmlFor={`reason-${pos}`}>Spotlight reason (optional)</Label>
                      <Textarea
                        id={`reason-${pos}`}
                        name="spotlightReason"
                        rows={2}
                        maxLength={280}
                        placeholder="Why this candidate? Editorial copy shown under their card."
                        defaultValue={slot?.spotlightReason ?? ""}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`image-${pos}`}>Image override URL (optional)</Label>
                      <Input
                        id={`image-${pos}`}
                        name="imageUrl"
                        type="url"
                        placeholder="https://… (overrides their avatar on the spotlight tile)"
                        defaultValue={slot?.imageUrl ?? ""}
                      />
                    </div>
                    <Button type="submit" size="sm" className="w-full">
                      {slot ? "Replace slot" : "Feature candidate"}
                    </Button>
                  </form>
                </details>
              </Card>
            );
          })}
        </div>

        <Card className="border-dashed">
          <h2 className="text-section text-emce-text">Coming next week</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Slots reset every Monday at 00:00 IST. Last week's spotlights drop off automatically; you can pre-curate next week's lineup by setting <code className="rounded bg-emce-light-soft px-1 text-[12px]">weekStart</code> to the next Monday in the form.
          </p>
        </Card>
      </div>
    </AdminShell>
  );
}
