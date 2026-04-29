import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { relativeTime } from "@/lib/utils";
import { writeRecommendation } from "@/server/candidates/actions";

interface PublicRec {
  id: string;
  body: string;
  relationship: string;
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
 * Public-profile section that lists peer recommendations addressed to
 * the candidate. Only `VISIBLE` recs are passed in by the page; this
 * component is otherwise read-only — managing pending / hidden recs
 * happens in /me/profile via the RecommendationsInbox component.
 */
export function RecommendationsSection({ recs }: { recs: PublicRec[] }) {
  if (recs.length === 0) return null;
  return (
    <Card>
      <h2 className="text-section text-emce-text">Recommendations</h2>
      <p className="mt-1 text-hint text-emce-text-sec">
        {recs.length} {recs.length === 1 ? "person has" : "people have"} written
        about working with this candidate.
      </p>
      <ul className="mt-4 space-y-4">
        {recs.map((r) => {
          const giver = r.fromUser.candidateProfile;
          if (!giver) return null;
          const giverName =
            `${giver.firstName} ${giver.lastName ?? ""}`.trim();
          return (
            <li
              key={r.id}
              className="rounded-md border border-emce-border bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <Link href={`/${giver.slug}`} className="shrink-0">
                  <Avatar
                    src={giver.profilePhotoUrl}
                    name={giverName}
                    size="md"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/${giver.slug}`}
                      className="font-bold text-emce-text hover:underline"
                    >
                      {giverName}
                    </Link>
                    {giver.headline && (
                      <span className="line-clamp-1 text-hint text-emce-text-sec">
                        {giver.headline}
                      </span>
                    )}
                  </div>
                  <p className="text-hint text-emce-text-muted">
                    {r.relationship} · {relativeTime(r.createdAt)}
                  </p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-emce-text">
                &ldquo;{r.body}&rdquo;
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

interface WriteFormProps {
  toUserSlug: string;
  /** Pre-filled when the viewer has already written one — allows edits. */
  existing?: { body: string; relationship: string; status: "PENDING" | "VISIBLE" | "HIDDEN" } | null;
}

/**
 * Inline form rendered on someone else's profile when the viewer is
 * signed in. Posts to `writeRecommendation` which creates / updates
 * the rec as PENDING for the receiver to approve.
 */
export function WriteRecommendationForm({ toUserSlug, existing }: WriteFormProps) {
  return (
    <Card>
      <h3 className="text-section text-emce-text">
        {existing ? "Update your recommendation" : "Write a recommendation"}
      </h3>
      <p className="mt-1 text-hint text-emce-text-sec">
        {existing
          ? `Status: ${existing.status === "VISIBLE" ? "✓ visible on profile" : existing.status === "PENDING" ? "⏳ awaiting approval" : "🙈 hidden by recipient"}. Editing returns it to pending.`
          : "Lands as pending — only goes public after the recipient approves it. 80–1200 characters."}
      </p>
      <form action={writeRecommendation} className="mt-4 space-y-3">
        <input type="hidden" name="toUserSlug" value={toUserSlug} />
        <div>
          <label className="text-xs font-bold text-emce-text" htmlFor="rec-relationship">
            How do you know them?
          </label>
          <input
            id="rec-relationship"
            name="relationship"
            type="text"
            required
            defaultValue={existing?.relationship ?? ""}
            placeholder="e.g. Worked together at Ola Electric · 2023–2024"
            maxLength={140}
            className="mt-1 w-full rounded-md border border-emce-border bg-white px-3 py-2 text-sm text-emce-text outline-none focus:border-emce-mid"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-emce-text" htmlFor="rec-body">
            What stood out?
          </label>
          <textarea
            id="rec-body"
            name="body"
            required
            rows={5}
            minLength={80}
            maxLength={1200}
            defaultValue={existing?.body ?? ""}
            placeholder="Specific moments, projects, or contributions you saw first-hand. Avoid generic praise — recruiters spot it."
            className="mt-1 w-full rounded-md border border-emce-border bg-white px-3 py-2 text-sm text-emce-text outline-none focus:border-emce-mid"
          />
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-emce-darkest px-5 py-2 text-sm font-bold text-emce-mid hover:bg-emce-dark"
          >
            {existing ? "Update recommendation" : "Send recommendation"}
          </button>
        </div>
      </form>
    </Card>
  );
}
