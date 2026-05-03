import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { applyResumeDraft } from "@/server/candidates/actions";
import type { ParsedResume } from "@/lib/ai/resume-parser";

export const metadata = { title: "Confirm parsed details" };

export default async function ConfirmStep() {
  const session = await auth();
  if (!session?.user) redirect("/signin?next=/onboarding/confirm");

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!profile) redirect("/onboarding");

  const draft = profile.resumeParseDraft as ParsedResume | null;

  if (!draft || !profile.resumeParsedAt) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-bold text-emce-text">Still processing your resume</h1>
        <p className="mt-2 text-sm text-emce-text-sec">
          Hang tight — this normally takes a few seconds. Refresh in a moment, or
          re-upload if it&apos;s been more than a minute.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/onboarding/resume">Re-upload</Link>
          </Button>
          <Button asChild>
            <Link href="/onboarding/confirm">Refresh</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-8">
        <Badge variant="default" className="mb-2">Step 3 of 5</Badge>
        <h1 className="text-2xl font-extrabold text-emce-text">
          Here&apos;s what we extracted
        </h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Review and continue. You can edit anything from your profile page later.
        </p>
      </Card>

      <Card>
        <h3 className="mb-2 text-section text-emce-text">Basics</h3>
        <Field label="Name" value={[draft.firstName, draft.lastName].filter(Boolean).join(" ")} />
        <Field label="Headline" value={draft.headline} />
        <Field label="Location" value={draft.location} />
        <Field label="Email" value={draft.email} />
        <Field label="Phone" value={draft.phone} />
        <Field label="LinkedIn" value={draft.linkedinUrl} />
      </Card>

      {draft.summary && (
        <Card>
          <h3 className="mb-2 text-section text-emce-text">Summary</h3>
          <p className="text-body text-emce-text-sec">{draft.summary}</p>
        </Card>
      )}

      {!!draft.experiences?.length && (
        <Card>
          <h3 className="mb-3 text-section text-emce-text">
            Experience <span className="text-emce-text-muted">({draft.experiences.length})</span>
          </h3>
          <ul className="space-y-3">
            {draft.experiences.map((e, i) => (
              <li key={i} className="border-l-2 border-emce-mid pl-3">
                <div className="font-bold text-emce-text">
                  {e.title} <span className="text-emce-text-sec">— {e.company}</span>
                </div>
                <div className="text-hint text-emce-text-muted">
                  {e.startDate ?? "?"} – {e.current ? "Present" : (e.endDate ?? "?")} · {e.location ?? "—"}
                </div>
                {e.description && (
                  <p className="mt-1 text-hint text-emce-text-sec">{e.description}</p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!draft.education?.length && (
        <Card>
          <h3 className="mb-3 text-section text-emce-text">Education</h3>
          <ul className="space-y-2">
            {draft.education.map((ed, i) => (
              <li key={i}>
                <div className="font-bold text-emce-text">{ed.institution}</div>
                <div className="text-hint text-emce-text-sec">
                  {[ed.degree, ed.field].filter(Boolean).join(" · ")} · {ed.startYear ?? "?"}–{ed.endYear ?? "?"}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!!draft.skills?.length && (
        <Card>
          <h3 className="mb-3 text-section text-emce-text">
            Skills <span className="text-emce-text-muted">({draft.skills.length})</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            {draft.skills.map((s) => (
              <Badge key={s} variant="default">{s}</Badge>
            ))}
          </div>
        </Card>
      )}

      {!!draft.evDomains?.length && (
        <Card>
          <h3 className="mb-3 text-section text-emce-text">EV domains detected</h3>
          <div className="flex flex-wrap gap-2">
            {draft.evDomains.map((d) => (
              <Badge key={d} variant="success">{d.replace("-", " ")}</Badge>
            ))}
          </div>
        </Card>
      )}

      {!!draft.certifications?.length && (
        <Card>
          <h3 className="mb-3 text-section text-emce-text">Certifications</h3>
          <ul className="space-y-2">
            {draft.certifications.map((c, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  <span className="font-bold text-emce-text">{c.name}</span>
                  {c.issuer && <span className="text-emce-text-sec"> — {c.issuer}</span>}
                </span>
                {c.isDIYguru && <Badge variant="verified">⭐ DIYguru</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {draft.detectedDIYguru && (
        <Card className="border-emce-mid bg-emce-light-soft">
          <div className="flex items-center gap-3">
            <Badge variant="verified">DIYguru detected</Badge>
            <p className="text-sm text-emce-text-sec">
              We spotted DIYguru in your resume. Once an admin matches you to the roster,
              you&apos;ll get the official verified badge.
            </p>
          </div>
        </Card>
      )}

      <div className="flex justify-between pt-2">
        <Button asChild variant="outline">
          <Link href="/onboarding/resume">← Re-upload</Link>
        </Button>
        <form action={applyResumeDraft}>
          <Button type="submit" size="lg">Looks good →</Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5">
      <span className="text-hint uppercase tracking-wide text-emce-text-muted">{label}</span>
      <span className="col-span-2 text-body text-emce-text">{value}</span>
    </div>
  );
}
