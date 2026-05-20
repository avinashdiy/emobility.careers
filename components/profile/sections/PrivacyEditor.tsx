"use client";

import { useTransition } from "react";
import type { ContactVisibility, ResumeVisibility } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, FileText, Sparkles } from "lucide-react";
import {
  CONTACT_VISIBILITY_DESCRIPTIONS,
  RESUME_VISIBILITY_DESCRIPTIONS,
} from "@/lib/profile-visibility";
import { updatePrivacySettings, removeResume } from "@/server/candidates/actions";

interface Props {
  contactVisibility: ContactVisibility;
  resumeVisibility: ResumeVisibility;
  useAiResume: boolean;
  hasManualResume: boolean;
  hasAiResume: boolean;
  aiResumeGeneratedAt: Date | null;
}

/**
 * Privacy + résumé visibility controls. PRIVATE is the default for both
 * contact and résumé to keep new accounts safe; the user opts in to wider
 * visibility deliberately. The AI résumé toggle picks which version
 * (auto-generated vs manually uploaded) is served when someone with
 * permission downloads.
 */
export function PrivacyEditor({
  contactVisibility,
  resumeVisibility,
  useAiResume,
  hasManualResume,
  hasAiResume,
  aiResumeGeneratedAt,
}: Props) {
  const [pending, startTransition] = useTransition();

  function save(form: FormData) {
    startTransition(async () => {
      const r = await updatePrivacySettings(form);
      r.ok ? toast.success(r.message ?? "Saved.") : toast.error(r.message ?? "Failed.");
    });
  }

  return (
    <Card id="privacy">
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-emce-darkest" />
        <h2 className="text-section text-emce-text">Privacy & resume</h2>
      </div>
      <p className="mt-1 text-hint text-emce-text-sec">
        Sensitive fields default to private. Loosen them when you&apos;re ready to be reached.
      </p>

      <form action={save} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="contactVisibility">Email & phone visibility</Label>
          <NativeSelect id="contactVisibility" name="contactVisibility" defaultValue={contactVisibility} disabled={pending}>
            <option value="PRIVATE">Private (only me)</option>
            <option value="CONNECTIONS">Connections only</option>
            <option value="EMPLOYERS_ONLY">Verified employers only</option>
            <option value="EVERYONE">Public on my profile</option>
          </NativeSelect>
          {/* Site-wide privacy floor explainer — added 2026-05 alongside
              the canSeeContact tightening. The dropdown still lets you
              pick the looser options because we plan to relax this in
              future, but right now they all behave the same. */}
          <div className="mt-2 rounded-md border border-emce-border bg-emce-light-soft/50 p-2 text-hint text-emce-text-sec">
            <strong>Heads up:</strong> regardless of your choice above, email
            and phone are currently kept off your public profile. They surface
            only to admins, recruiters at companies where you&apos;ve applied,
            and people you&apos;ve granted via a contact-share request.
          </div>
          <p className="mt-2 text-hint text-emce-text-sec">{CONTACT_VISIBILITY_DESCRIPTIONS[contactVisibility]}</p>
        </div>

        <div>
          <Label htmlFor="resumeVisibility">Resume visibility</Label>
          <NativeSelect id="resumeVisibility" name="resumeVisibility" defaultValue={resumeVisibility} disabled={pending}>
            <option value="PRIVATE">Private — share only on application</option>
            <option value="EMPLOYERS_ONLY">Verified employers only</option>
            <option value="EVERYONE">Anyone with my profile link</option>
          </NativeSelect>
          <p className="mt-1 text-hint text-emce-text-sec">{RESUME_VISIBILITY_DESCRIPTIONS[resumeVisibility]}</p>
        </div>

        <div className="rounded-md border border-emce-border bg-emce-light-soft/40 p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emce-mid-muted" />
            <span className="text-sm font-bold text-emce-text">AI-drafted resume</span>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            We auto-draft a clean, ATS-friendly PDF from your profile every time you edit experience, education, or skills.
            {hasAiResume && aiResumeGeneratedAt && (
              <> Last refreshed {new Date(aiResumeGeneratedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.</>
            )}
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="useAiResume"
              defaultChecked={useAiResume}
              disabled={pending}
              className="mt-0.5 h-4 w-4 rounded border-emce-border"
            />
            <span>
              <span className="block font-bold text-emce-text">Use the AI-drafted version</span>
              <span className="block text-hint text-emce-text-sec">
                Uncheck to serve your own uploaded PDF (below) instead.
                {hasManualResume ? " You currently have a manual upload on file." : " You haven't uploaded a manual resume yet."}
              </span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emce-dark px-4 py-2 text-sm font-bold text-emce-light hover:bg-emce-dark-deep disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save privacy settings"}
        </button>
      </form>

      <div className="mt-6 border-t border-emce-border pt-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-emce-darkest" />
          <h3 className="text-sm font-bold text-emce-text">Manual resume upload (PDF or DOCX)</h3>
        </div>
        <p className="mt-1 text-hint text-emce-text-sec">
          Optional — overrides the AI version when "Use the AI-drafted version" above is off.
          The uploader at{" "}
          <a href="/onboarding/resume" className="font-bold text-emce-dark hover:underline">/onboarding/resume</a>{" "}
          accepts PDF + DOCX.
        </p>
        {/* Remove-on-file affordance — until this shipped, a
            candidate who'd uploaded a resume could only REPLACE it
            via re-upload, never DELETE. That mattered for people
            who'd accidentally uploaded the wrong PDF (or a draft
            with sensitive info) and wanted it off recruiters'
            radar immediately. We only delete the DB pointer, not
            the underlying file — frozen `Application.resumeSnapshotUrl`
            references stay live so recruiters reviewing existing
            applications still see what was submitted at apply time. */}
        {hasManualResume && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-emce-border bg-white p-2">
            <FileText className="h-4 w-4 text-emce-text-sec" />
            <span className="flex-1 text-hint font-semibold text-emce-text">
              Resume on file
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Remove your uploaded resume? Recruiters reviewing existing applications will still see what you submitted at apply time, but new viewers will see no resume until you upload again.")) return;
                startTransition(async () => {
                  const r = await removeResume();
                  r.ok ? toast.success(r.message ?? "Removed.") : toast.error(r.message ?? "Failed.");
                });
              }}
              className="rounded-md border border-emce-red bg-white px-3 py-1 text-xs font-bold text-emce-red-deep hover:bg-emce-red-light disabled:opacity-50"
            >
              {pending ? "Removing…" : "Remove"}
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
