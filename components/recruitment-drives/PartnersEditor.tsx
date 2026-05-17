import { RecruitmentDrivePartnerType } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import {
  createEventPartner as _createEventPartner,
  deleteEventPartner as _deleteEventPartner,
} from "@/server/recruitment-drives/actions";

/**
 * Admin editor for event-level partners (the brochure's
 * "Affiliations & Partners" panel — IIT Jammu, AICTE, ASDC, etc.).
 *
 * Server component — pure rendering + inline server-action forms.
 * The public fair page groups partners by type (academic /
 * government / certifier / industry / etc.) into separate logo
 * strips, so each row's type pill here is the same key the public
 * grouping uses.
 */
export function PartnersEditor({
  driveId,
  partners,
}: {
  driveId: string;
  partners: {
    id: string;
    name: string;
    type: RecruitmentDrivePartnerType;
    logoUrl: string | null;
    url: string | null;
    caption: string | null;
  }[];
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section text-emce-text">Affiliations &amp; event partners</h2>
        <p className="text-hint text-emce-text-sec">
          Distinct from booth recruiters. Use for academic / government /
          certifier / industry endorsements (e.g. IIT Jammu, AICTE, ASDC).
        </p>
      </div>

      {partners.length > 0 && (
        <ul className="mt-3 divide-y divide-emce-border rounded-md border border-emce-border">
          {partners.map((p) => (
            <li key={p.id} className="flex items-center gap-3 p-3">
              {p.logoUrl ? (
                // Tiny preview swatch — same scale as the public
                // logo-strip render. Lets the admin notice a wrong
                // logo URL at glance.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.logoUrl}
                  alt=""
                  className="h-8 w-12 shrink-0 rounded bg-white object-contain p-1"
                />
              ) : (
                <span className="grid h-8 w-12 shrink-0 place-items-center rounded bg-emce-light-soft text-[10px] font-bold uppercase tracking-wide text-emce-text-muted">
                  Logo
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-emce-text">{p.name}</p>
                {p.caption && (
                  <p className="line-clamp-1 text-hint text-emce-text-sec">{p.caption}</p>
                )}
                {p.url && (
                  <p className="line-clamp-1 text-[10px] text-emce-text-muted">
                    {p.url}
                  </p>
                )}
              </div>
              <Badge variant="default" size="sm">
                {humaniseType(p.type)}
              </Badge>
              <form
                action={async (fd: FormData) => {
                  "use server";
                  await _deleteEventPartner(fd);
                }}
              >
                <input type="hidden" name="driveId" value={driveId} />
                <input type="hidden" name="partnerId" value={p.id} />
                <ConfirmSubmit
                  variant="ghost"
                  size="sm"
                  confirm={`Remove "${p.name}" from this fair's partners?`}
                  pendingLabel="…"
                  className="text-emce-red-deep"
                >
                  Remove
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}

      {partners.length === 0 && (
        <p className="mt-3 rounded-md border border-dashed border-emce-border bg-emce-light-soft/30 p-3 text-hint text-emce-text-sec">
          No partners yet. Adding 3-5 academic / certifier / government
          endorsements turns the public page into a trust signal colleges
          recognise. The brochure example lists IIT Jammu, AICTE, NEAT,
          NSDC, ASDC.
        </p>
      )}

      <form
        action={async (fd: FormData) => {
          "use server";
          await _createEventPartner(fd);
        }}
        className="mt-4 grid gap-2 border-t border-emce-border pt-4 sm:grid-cols-2"
      >
        <input type="hidden" name="driveId" value={driveId} />
        <div>
          <Label htmlFor="partner-name">Partner name</Label>
          <Input
            id="partner-name"
            name="name"
            placeholder="e.g. IIT Jammu"
            required
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="partner-type">Type</Label>
          <NativeSelect id="partner-type" name="type" defaultValue="ACADEMIC">
            <option value="ACADEMIC">Academic</option>
            <option value="GOVERNMENT">Government</option>
            <option value="CERTIFIER">Certifier / Skill council</option>
            <option value="INDUSTRY">Industry endorsement</option>
            <option value="ASSOCIATION">Association</option>
            <option value="MEDIA">Media</option>
            <option value="OTHER">Other</option>
          </NativeSelect>
        </div>
        <div>
          <Label htmlFor="partner-logo">Logo URL (optional)</Label>
          <Input
            id="partner-logo"
            name="logoUrl"
            type="url"
            placeholder="https://…/logo.png"
            maxLength={400}
          />
        </div>
        <div>
          <Label htmlFor="partner-url">Partner website (optional)</Label>
          <Input
            id="partner-url"
            name="url"
            type="url"
            placeholder="https://iitjammu.ac.in"
            maxLength={400}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="partner-caption">Caption (optional)</Label>
          <Input
            id="partner-caption"
            name="caption"
            placeholder="e.g. Academic Partner · Patron institution"
            maxLength={140}
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <SubmitButton size="sm" pendingLabel="Adding…">
            + Add partner
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

function humaniseType(t: RecruitmentDrivePartnerType): string {
  switch (t) {
    case "ACADEMIC": return "Academic";
    case "GOVERNMENT": return "Govt.";
    case "CERTIFIER": return "Certifier";
    case "INDUSTRY": return "Industry";
    case "ASSOCIATION": return "Assoc.";
    case "MEDIA": return "Media";
    default: return "Other";
  }
}
