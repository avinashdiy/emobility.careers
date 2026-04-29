import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  approveRecommendation,
  hideRecommendation,
} from "@/server/candidates/actions";
import { relativeTime } from "@/lib/utils";

interface ReceivedRec {
  id: string;
  body: string;
  relationship: string;
  status: "PENDING" | "VISIBLE" | "HIDDEN";
  createdAt: Date;
  fromUser: {
    candidateProfile: {
      slug: string;
      firstName: string;
      lastName: string | null;
      headline: string | null;
      profilePhotoUrl: string | null;
    } | null;
  };
}

/**
 * Recommendation triage on /me/profile. Renders all recs the
 * candidate has received, grouped by status — pending up top so
 * the candidate sees + acts on them first. Hidden recs surface
 * here too so the candidate can un-hide if they change their mind.
 */
export function RecommendationsInbox({ recs }: { recs: ReceivedRec[] }) {
  if (recs.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-section text-emce-text">Recommendations received</h2>
        <p className="mt-2 text-hint text-emce-text-sec">
          No one has written a recommendation for you yet. Share your
          public profile and ask people you&apos;ve worked with to
          endorse you — they&apos;ll see a &ldquo;Write a recommendation&rdquo;
          form right under your About section.
        </p>
      </Card>
    );
  }

  const pending = recs.filter((r) => r.status === "PENDING");
  const visible = recs.filter((r) => r.status === "VISIBLE");
  const hidden = recs.filter((r) => r.status === "HIDDEN");

  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Recommendations received</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        Pending recs only show on your public profile after you approve
        them. You can hide a visible one any time — the giver isn&apos;t
        notified.
      </p>

      {pending.length > 0 && (
        <Group title={`Pending review · ${pending.length}`} recs={pending} actionLabel="Approve" />
      )}
      {visible.length > 0 && (
        <Group title={`Visible on profile · ${visible.length}`} recs={visible} actionLabel="Hide" />
      )}
      {hidden.length > 0 && (
        <Group title={`Hidden · ${hidden.length}`} recs={hidden} actionLabel="Approve" />
      )}
    </Card>
  );
}

function Group({
  title,
  recs,
  actionLabel,
}: {
  title: string;
  recs: ReceivedRec[];
  actionLabel: "Approve" | "Hide";
}) {
  return (
    <div className="mt-5 first:mt-4">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-emce-text-sec">
        {title}
      </h3>
      <ul className="mt-2 space-y-3">
        {recs.map((r) => {
          const giver = r.fromUser.candidateProfile;
          const giverName = giver
            ? `${giver.firstName} ${giver.lastName ?? ""}`.trim()
            : "Someone";
          return (
            <li
              key={r.id}
              className="rounded-md border border-emce-border bg-white p-4"
            >
              <div className="flex items-start gap-3">
                {giver ? (
                  <Link href={`/${giver.slug}`} className="shrink-0">
                    <Avatar src={giver.profilePhotoUrl} name={giverName} size="sm" />
                  </Link>
                ) : (
                  <Avatar name={giverName} size="sm" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    {giver ? (
                      <Link href={`/${giver.slug}`} className="font-bold text-emce-text hover:underline">
                        {giverName}
                      </Link>
                    ) : (
                      <span className="font-bold text-emce-text">{giverName}</span>
                    )}
                    <Badge
                      variant={
                        r.status === "VISIBLE" ? "success" : r.status === "PENDING" ? "warning" : "outline"
                      }
                      size="sm"
                    >
                      {r.status === "VISIBLE" ? "Visible" : r.status === "PENDING" ? "Pending" : "Hidden"}
                    </Badge>
                  </div>
                  <p className="text-hint text-emce-text-muted">
                    {r.relationship} · {relativeTime(r.createdAt)}
                  </p>
                </div>
                <form
                  action={actionLabel === "Approve" ? approveRecommendation : hideRecommendation}
                  className="shrink-0"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant={actionLabel === "Approve" ? "default" : "ghost"}
                  >
                    {actionLabel}
                  </Button>
                </form>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-emce-text">
                &ldquo;{r.body}&rdquo;
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
