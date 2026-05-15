"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { attachJobToDrive } from "@/server/recruitment-drives/actions";

interface JobCandidate {
  id: string;
  title: string;
  assessments: {
    id: string;
    title: string;
    type: string;
    durationMins: number | null;
  }[];
}

/**
 * "Attach a job to your booth" form. Two-step:
 *   1. Pick which of the company's OPEN jobs to attach.
 *   2. Optionally pick one of that job's assessments as the
 *      pre-screening challenge. The dropdown filters dynamically
 *      based on the selected job (assessments are per-job).
 *
 * On submit we call attachJobToDrive directly — server-side
 * validates ownership and uniqueness. Form re-mounts on submit
 * via the `key` prop bound to the selected job id, clearing the
 * form for the next attach.
 */
export function AttachJobForm({
  driveId,
  candidates,
}: {
  driveId: string;
  candidates: JobCandidate[];
}) {
  const [pending, startTransition] = useTransition();
  const [jobId, setJobId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedJob = candidates.find((c) => c.id === jobId);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await attachJobToDrive(formData);
      if (!r.ok) {
        setError(r.message ?? "Couldn't attach the job.");
      } else {
        setJobId("");
        setAssessmentId("");
      }
    });
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="driveId" value={driveId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="jobId">Add a role to your booth</Label>
          <NativeSelect
            id="jobId"
            name="jobId"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setAssessmentId(""); // reset challenge picker on job change
            }}
            required
          >
            <option value="">Pick one of your OPEN jobs…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="challengeAssessmentId">
            Screening challenge <span className="text-emce-text-muted">(optional)</span>
          </Label>
          <NativeSelect
            id="challengeAssessmentId"
            name="challengeAssessmentId"
            value={assessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
            disabled={!selectedJob || selectedJob.assessments.length === 0}
          >
            <option value="">No challenge — apply goes straight to ATS</option>
            {selectedJob?.assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.type.toLowerCase()}
                {a.durationMins ? `, ${a.durationMins} min` : ""})
              </option>
            ))}
          </NativeSelect>
          <p className="mt-1 text-hint text-emce-text-muted">
            {selectedJob && selectedJob.assessments.length === 0
              ? "This job has no assessments yet. Add one from the job's edit page first."
              : "Optional — adding one auto-gates the ATS."}
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-emce-red-light p-2 text-hint text-emce-red-deep">
          {error}
        </div>
      )}

      <Button type="submit" size="sm" disabled={!jobId || pending}>
        {pending ? "Attaching…" : "Attach to booth"}
      </Button>
    </form>
  );
}
