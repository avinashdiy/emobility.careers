"use client";

import { useState } from "react";
import { EntityPicker, type EntityMatch } from "@/components/profile/EntityPicker";
import { searchInstitutions, createInstitutionLite } from "@/server/entities/actions";
import { NativeSelect } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { InstitutionType } from "@prisma/client";

/**
 * Institution picker for the education editor. The "create new" path needs
 * a type (UNIVERSITY / COLLEGE / SCHOOL / …) since institutions are more
 * heterogeneous than companies — we surface a small type selector that the
 * candidate fills in only when creating a fresh entry.
 */
export function InstitutionPicker({
  initialId,
  initialText,
  initialEntity,
  fieldPrefix = "",
}: {
  initialId?: string | null;
  initialText?: string;
  initialEntity?: EntityMatch | null;
  fieldPrefix?: string;
}) {
  const [type, setType] = useState<InstitutionType>("COLLEGE");

  return (
    <div className="space-y-2">
      <EntityPicker
        kind="institution"
        idFieldName={`${fieldPrefix}institutionId`}
        textFieldName={`${fieldPrefix}institution`}
        initialId={initialId}
        initialText={initialText}
        initialEntity={initialEntity}
        onSearch={async (q) => {
          const r = await searchInstitutions(q);
          return r.map((c) => ({
            id: c.id,
            name: c.name,
            logoUrl: c.logoUrl,
            subtitle: [c.type.replace("_", " "), c.city].filter(Boolean).join(" · "),
            // Surfaces to EntityPicker so PENDING + UNVERIFIED rows
            // render with the "Pending review" pill — same flow as
            // CompanyPicker.
            verificationStatus: c.verificationStatus,
          }));
        }}
        onCreate={async (name) => createInstitutionLite({ name, type })}
        placeholder="Search or type a school / college name…"
        label="Institution"
        helpText="Pick from the list when possible. If your institution isn't there, submit it for admin review — the name shows on your profile right away."
      />

      {/* Hidden type selector — only shown when the candidate is about to
          create a new institution (no linked id and 2+ chars typed). The
          UI surfaces it permanently so it's available without a state
          callback from the picker. */}
      <details className="rounded-md border border-emce-border p-2 text-sm">
        <summary className="cursor-pointer font-bold text-emce-text-sec">
          Institution type (only used when creating a new one)
        </summary>
        <div className="mt-2">
          <Label htmlFor={`${fieldPrefix}institutionType`}>Type</Label>
          <NativeSelect
            id={`${fieldPrefix}institutionType`}
            value={type}
            onChange={(e) => setType(e.target.value as InstitutionType)}
          >
            <option value="UNIVERSITY">University</option>
            <option value="COLLEGE">College</option>
            <option value="SCHOOL">School</option>
            <option value="ITI">ITI</option>
            <option value="POLYTECHNIC">Polytechnic</option>
            <option value="RESEARCH_INSTITUTE">Research Institute</option>
            <option value="TRAINING_CENTER">Training Center</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </div>
      </details>
    </div>
  );
}
