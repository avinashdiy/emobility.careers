import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import { findSkillSwapMatches } from "@/server/networking/skill-swap";
import { requestSkillSwap } from "@/server/networking/actions";

export const metadata = { title: "Skill swap" };

/**
 * #5 Skill-trade pairing — candidate-facing match page.
 *
 * Shows up to ~12 candidates the matching engine paired the viewer
 * with. Each card surfaces:
 *   • The other candidate's profile snippet
 *   • What they can teach (drawn from THEIR known skills ∩ YOUR
 *     learning skills)
 *   • What YOU can teach them
 *   • A "Request swap" form with an editable intro message
 *
 * Empty states cover all three failure modes: no learning skills
 * set, no known skills set, and no matches found yet.
 */
export const dynamic = "force-dynamic";

export default async function SkillSwapPage() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/me/skill-swap");

  const me = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      learningSkills: true,
      skills: { select: { skill: { select: { name: true } } } },
    },
  });
  if (!me) redirect("/onboarding");

  const hasLearning = me.learningSkills.length > 0;
  const hasKnown = me.skills.length > 0;
  const matches = hasLearning && hasKnown
    ? await findSkillSwapMatches({ candidateProfileId: me.id, limit: 12 })
    : [];

  return (
    <div className="container max-w-5xl space-y-6 py-8">
      <ToastFromSearchParams />
      <PageHeader
        eyebrow="Networking · #5"
        title="Skill swap — find a learning partner"
        accent="Skill swap"
        subtitle="We match you with candidates who know what you want to learn, and want to learn what you know. One-hour knowledge swaps, peer-to-peer."
      />

      {!hasKnown && (
        <EmptyState
          variant="mesh"
          icon="🧠"
          title="Add some known skills first"
          body="The match engine pairs YOUR known skills with someone else's learning list. Edit your profile to add a few skills you can teach."
          action={
            <Link
              href="/me/profile"
              className="rounded-md bg-emce-dark px-4 py-2 text-sm font-bold text-emce-light hover:bg-emce-dark-deep"
            >
              Edit profile
            </Link>
          }
        />
      )}

      {hasKnown && !hasLearning && (
        <EmptyState
          variant="mesh"
          icon="🎯"
          title="Tell us what you want to learn"
          body="Add 2–4 skills to your 'I'm learning' list (in profile preferences). We'll match you with someone who can teach them."
          action={
            <Link
              href="/me/profile"
              className="rounded-md bg-emce-dark px-4 py-2 text-sm font-bold text-emce-light hover:bg-emce-dark-deep"
            >
              Edit profile
            </Link>
          }
        />
      )}

      {hasKnown && hasLearning && matches.length === 0 && (
        <EmptyState
          variant="soft"
          icon="🔍"
          title="No swap matches yet"
          body="As more candidates fill in their learning lists, fresh matches will land here. Check back in a few days, or refine your learning skills to broaden the pool."
        />
      )}

      {matches.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {matches.map((m) => (
            <li key={m.candidateProfileId}>
              <Card className="h-full p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar
                    src={m.profilePhotoUrl}
                    name={`${m.firstName} ${m.lastName ?? ""}`.trim()}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${m.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate font-bold text-emce-text hover:underline"
                    >
                      {m.firstName} {m.lastName ?? ""}
                    </Link>
                    {m.headline && (
                      <p className="line-clamp-2 text-[11px] leading-snug text-emce-text-sec">
                        {m.headline}
                      </p>
                    )}
                    {m.city && (
                      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-emce-text-muted">
                        {m.city}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-hint">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                      They can teach
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.theyCanTeach.map((s) => (
                        <Badge key={`t-${s}`} variant="success" size="sm">{s}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emce-mid-muted">
                      You can teach
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.youCanTeach.map((s) => (
                        <Badge key={`y-${s}`} variant="default" size="sm">{s}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <form
                  action={requestSkillSwap}
                  className="space-y-2 border-t border-emce-border pt-3"
                >
                  <input type="hidden" name="targetSlug" value={m.slug} />
                  {/* `defaultValue` (not `placeholder`) so the templated
                      opener is the actual submitted text if the user
                      clicks Send without editing — pre-fix the
                      placeholder was decorative and an unedited form
                      sent an empty note. */}
                  <Textarea
                    name="note"
                    rows={2}
                    maxLength={400}
                    defaultValue={`Hey ${m.firstName}, open to a 1-hour swap on ${m.theyCanTeach[0] ?? "your area"} ↔ ${m.youCanTeach[0] ?? "mine"}?`}
                  />
                  <SubmitButton variant="outline" size="sm" pendingLabel="Sending…">
                    Request swap →
                  </SubmitButton>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
