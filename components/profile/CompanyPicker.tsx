"use client";

import { EntityPicker, type EntityMatch } from "@/components/profile/EntityPicker";
import { searchCompanies, createCompanyLite } from "@/server/entities/actions";

/**
 * Pre-bound EntityPicker for Companies. Used by ExperienceEditor.
 * Encapsulates the server-action wiring so the editor stays a server
 * component.
 */
export function CompanyPicker({
  initialId,
  initialText,
  initialEntity,
  fieldPrefix = "",
}: {
  initialId?: string | null;
  initialText?: string;
  initialEntity?: EntityMatch | null;
  /** Optional id prefix to keep multiple instances (one per experience row) unique. */
  fieldPrefix?: string;
}) {
  return (
    <EntityPicker
      kind="company"
      idFieldName={`${fieldPrefix}companyId`}
      textFieldName={`${fieldPrefix}company`}
      initialId={initialId}
      initialText={initialText}
      initialEntity={initialEntity}
      onSearch={async (q) => {
        const r = await searchCompanies(q);
        return r.map((c) => ({
          id: c.id,
          name: c.name,
          logoUrl: c.logoUrl,
          subtitle: c.hqLocation,
          // Surfaces to EntityPicker so PENDING rows render with the
          // "Pending review" pill — disclosure that the company isn't
          // admin-verified yet, but still selectable.
          verificationStatus: c.verificationStatus,
        }));
      }}
      onCreate={async (name) => createCompanyLite({ name })}
      placeholder="Search or type a company name…"
      label="Company"
      helpText="Pick from the list when possible. If your company isn't there, submit it for admin review — the name shows on your profile right away."
    />
  );
}
