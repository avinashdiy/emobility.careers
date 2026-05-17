"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateRecruitmentDrive } from "@/server/recruitment-drives/actions";
import { emptyFormState, type FormState } from "@/lib/form-state";

/**
 * Admin form to edit a recruitment drive's base fields (title,
 * tagline, description, venue, dates, banner / hero image URLs).
 * Companion to `CreateFairForm` — same field set, but seeded from
 * the existing row and dispatches `updateRecruitmentDrive`.
 *
 * All other admin-curated content for a fair lives in separate
 * editors on the detail page:
 *   • Tracks → TracksEditor
 *   • Contact + FAQ → ContactAndFaqEditor
 *   • Partners → PartnersEditor
 *   • Speakers → SpeakersEditor
 *   • Hero stat targets + pitch blocks → HeroAndPitchEditor
 *   • Banner / hero image upload → FairImageUploader (separate)
 *
 * The split keeps each editor focused + each save independent —
 * an admin can fix a typo in the tagline without re-uploading the
 * banner or re-typing the description.
 */
export function EditFairForm({
  initial,
}: {
  initial: {
    driveId: string;
    title: string;
    tagline: string | null;
    description: string | null;
    city: string;
    state: string | null;
    country: string;
    venueName: string | null;
    venueAddress: string | null;
    venueLat: string | null;
    venueLng: string | null;
    startsAt: string;
    endsAt: string;
    registrationOpensAt: string | null;
    registrationClosesAt: string | null;
    bannerImageUrl: string | null;
    heroImageUrl: string | null;
  };
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const r = await updateRecruitmentDrive(prev, fd);
      if (r.ok) {
        // Soft-refresh so the admin detail page's other editors
        // re-render against the saved data, but keep the user on
        // the edit form (in case they want to keep tweaking).
        router.refresh();
      }
      return r;
    },
    emptyFormState,
  );

  return (
    <>
      {state.ok && state.message && (
        <div
          role="status"
          className="mb-3 rounded-md bg-emce-light-soft p-3 text-sm text-emce-success-deep"
        >
          ✓ {state.message}
        </div>
      )}
      {!state.ok && state.message && (
        <div role="alert" className="mb-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
          {state.message}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="driveId" value={initial.driveId} />

        <div>
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            required
            minLength={4}
            maxLength={160}
            defaultValue={initial.title}
          />
        </div>
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            name="tagline"
            maxLength={200}
            defaultValue={initial.tagline ?? ""}
          />
        </div>
        <div>
          <Label htmlFor="description">About this fair (rich text)</Label>
          <RichTextEditor
            id="description"
            name="description"
            defaultValue={initial.description ?? ""}
            minHeight={180}
          />
        </div>

        <fieldset>
          <legend className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Venue
          </legend>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                name="city"
                required
                minLength={2}
                maxLength={120}
                defaultValue={initial.city}
              />
            </div>
            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                name="state"
                maxLength={120}
                defaultValue={initial.state ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="country">Country (ISO-2)</Label>
              <Input
                id="country"
                name="country"
                minLength={2}
                maxLength={2}
                defaultValue={initial.country}
              />
            </div>
            <div>
              <Label htmlFor="venueName">Venue name</Label>
              <Input
                id="venueName"
                name="venueName"
                maxLength={200}
                defaultValue={initial.venueName ?? ""}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="venueAddress">Venue address</Label>
              <Input
                id="venueAddress"
                name="venueAddress"
                maxLength={500}
                defaultValue={initial.venueAddress ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="venueLat">
                Latitude <span className="text-emce-text-muted">(optional)</span>
              </Label>
              <Input
                id="venueLat"
                name="venueLat"
                type="number"
                step="any"
                defaultValue={initial.venueLat ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="venueLng">
                Longitude <span className="text-emce-text-muted">(optional)</span>
              </Label>
              <Input
                id="venueLng"
                name="venueLng"
                type="number"
                step="any"
                defaultValue={initial.venueLng ?? ""}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Dates
          </legend>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="startsAt">Starts at *</Label>
              <Input
                id="startsAt"
                name="startsAt"
                type="datetime-local"
                required
                defaultValue={initial.startsAt}
              />
            </div>
            <div>
              <Label htmlFor="endsAt">Ends at *</Label>
              <Input
                id="endsAt"
                name="endsAt"
                type="datetime-local"
                required
                defaultValue={initial.endsAt}
              />
            </div>
            <div>
              <Label htmlFor="registrationOpensAt">
                Registration opens <span className="text-emce-text-muted">(optional)</span>
              </Label>
              <Input
                id="registrationOpensAt"
                name="registrationOpensAt"
                type="datetime-local"
                defaultValue={initial.registrationOpensAt ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="registrationClosesAt">
                Registration closes <span className="text-emce-text-muted">(optional)</span>
              </Label>
              <Input
                id="registrationClosesAt"
                name="registrationClosesAt"
                type="datetime-local"
                defaultValue={initial.registrationClosesAt ?? ""}
              />
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-hint font-bold uppercase tracking-wide text-emce-text-muted">
            Imagery (URLs)
          </legend>
          <p className="mt-1 text-hint text-emce-text-muted">
            Prefer the dedicated <strong>Imagery</strong> card on the
            detail page for upload-from-disk. These URL fields exist for
            seeding / overriding from external image URLs.
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="bannerImageUrl">Banner image URL</Label>
              <Input
                id="bannerImageUrl"
                name="bannerImageUrl"
                type="url"
                defaultValue={initial.bannerImageUrl ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="heroImageUrl">Hero image URL</Label>
              <Input
                id="heroImageUrl"
                name="heroImageUrl"
                type="url"
                defaultValue={initial.heroImageUrl ?? ""}
              />
            </div>
          </div>
        </fieldset>

        <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
      </form>
    </>
  );
}
