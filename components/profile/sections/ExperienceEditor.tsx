import type { Experience, Company } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompanyPicker } from "@/components/profile/CompanyPicker";
import { saveExperience, deleteExperience } from "@/server/candidates/actions";
import { requestExperienceEmailVerify } from "@/server/experience-verify/actions";
import { formatMonthYear } from "@/lib/utils";
import { Trash2 } from "lucide-react";

type ExperienceWithCompany = Experience & {
  companyRef?: Pick<Company, "id" | "name" | "logoUrl" | "emailDomains"> | null;
};

function isoMonth(d?: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 7);
}

function ExperienceForm({ experience }: { experience?: ExperienceWithCompany }) {
  return (
    <form action={saveExperience} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {experience && <input type="hidden" name="id" value={experience.id} />}
      <div>
        <Label htmlFor={`title-${experience?.id ?? "new"}`}>Title</Label>
        <Input
          id={`title-${experience?.id ?? "new"}`}
          name="title"
          required
          defaultValue={experience?.title ?? ""}
        />
      </div>
      <div>
        {/* CompanyPicker handles search-or-create; posts both `company`
            (text) and `companyId` (FK) to the action. */}
        <CompanyPicker
          initialId={experience?.companyId ?? null}
          initialText={experience?.company ?? ""}
          initialEntity={
            experience?.companyRef
              ? { id: experience.companyRef.id, name: experience.companyRef.name, logoUrl: experience.companyRef.logoUrl }
              : null
          }
        />
      </div>
      <div>
        <Label htmlFor={`location-${experience?.id ?? "new"}`}>Location</Label>
        <Input
          id={`location-${experience?.id ?? "new"}`}
          name="location"
          defaultValue={experience?.location ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor={`startDate-${experience?.id ?? "new"}`}>Start</Label>
          <Input
            id={`startDate-${experience?.id ?? "new"}`}
            name="startDate"
            type="month"
            required
            defaultValue={isoMonth(experience?.startDate)}
          />
        </div>
        <div>
          <Label htmlFor={`endDate-${experience?.id ?? "new"}`}>End</Label>
          <Input
            id={`endDate-${experience?.id ?? "new"}`}
            name="endDate"
            type="month"
            defaultValue={isoMonth(experience?.endDate)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm font-bold text-emce-text-sec sm:col-span-2">
        <input
          type="checkbox"
          name="current"
          value="true"
          defaultChecked={experience?.current ?? false}
          className="h-4 w-4 accent-emce-mid"
        />
        I currently work here
      </label>
      <div className="sm:col-span-2">
        <Label htmlFor={`description-${experience?.id ?? "new"}`}>What you did</Label>
        <Textarea
          id={`description-${experience?.id ?? "new"}`}
          name="description"
          defaultValue={experience?.description ?? ""}
          rows={3}
          placeholder="2–4 bullet points on impact, scale, technologies."
        />
      </div>
      <div className="sm:col-span-2 flex justify-end">
        <Button type="submit" size="sm">
          {experience ? "Update" : "Add experience"}
        </Button>
      </div>
    </form>
  );
}

export function ExperienceEditor({ experiences }: { experiences: ExperienceWithCompany[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Experience</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Most-recent first. Add roles, internships, or relevant lab/project work.
      </p>

      {experiences.length === 0 ? (
        <p className="mb-4 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
          No experience yet. Add your first below.
        </p>
      ) : (
        <ul className="mb-6 space-y-3">
          {experiences.map((e) => {
            const eligibleForEmailVerify =
              !e.verifiedAt &&
              !!e.companyRef &&
              (e.companyRef.emailDomains?.length ?? 0) > 0;
            return (
              <li
                key={e.id}
                className="rounded-md border border-emce-border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-emce-text">{e.title}</span>
                      <span className="text-emce-text-sec">— {e.company}</span>
                      {/* Verified-Company badge — green chip when stamped.
                          The method tag clarifies which path earned it. */}
                      {e.verifiedAt && (
                        <Badge variant="success" className="text-[10px]">
                          ✓ Verified
                          {e.verifiedMethod === "EMAIL_DOMAIN" && " · email"}
                          {e.verifiedMethod === "RECRUITER_APPROVAL" && " · recruiter"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-hint text-emce-text-muted">
                      {formatMonthYear(e.startDate)} – {e.current ? "Present" : formatMonthYear(e.endDate)}
                      {e.location ? ` · ${e.location}` : ""}
                    </div>
                  </div>
                  <form action={deleteExperience}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmit
                      confirm={`Delete the "${e.title}" role at ${e.company}?`}
                      variant="ghost"
                      size="icon"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmSubmit>
                  </form>
                </div>

                {/* Verify-by-work-email row — only renders when (a) the
                    company is linked AND (b) the company has at least one
                    email-domain on its allowlist. Recruiters-on-team
                    approval is the alternate path for everyone else. */}
                {!e.verifiedAt && (
                  <div className="mt-2 border-t border-emce-border pt-2">
                    {eligibleForEmailVerify ? (
                      <form
                        action={requestExperienceEmailVerify}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <input type="hidden" name="experienceId" value={e.id} />
                        <Input
                          name="email"
                          type="email"
                          required
                          placeholder={`name@${e.companyRef!.emailDomains[0]}`}
                          className="sm:max-w-xs"
                        />
                        <Button type="submit" size="sm">
                          ✓ Verify with work email
                        </Button>
                        <p className="text-hint text-emce-text-muted">
                          Or ask a recruiter on the team to approve from{" "}
                          <code className="rounded bg-emce-light-soft px-1 text-[11px]">
                            /employer/verifications
                          </code>
                        </p>
                      </form>
                    ) : !e.companyId ? (
                      <p className="text-hint text-emce-text-sec">
                        Link this entry to a company (using the picker when editing) to enable verification.
                      </p>
                    ) : (
                      <p className="text-hint text-emce-text-sec">
                        Email-domain verification isn't available for this company yet — ask a recruiter on their team to approve from /employer/verifications.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-md border border-dashed border-emce-border p-4">
        <summary className="cursor-pointer text-sm font-bold text-emce-dark">
          + Add experience
        </summary>
        <div className="mt-4">
          <ExperienceForm />
        </div>
      </details>
    </Card>
  );
}
