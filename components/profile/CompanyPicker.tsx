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
        }));
      }}
      onCreate={async (name) => createCompanyLite({ name })}
      placeholder="Search or type a company name…"
      label="Company"
      helpText="We'll link to the company page if a match exists. Otherwise the entry stays as plain text."
    />
  );
}
