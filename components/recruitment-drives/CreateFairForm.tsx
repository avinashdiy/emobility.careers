"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createRecruitmentDrive,
  type CreateDriveResult,
} from "@/server/recruitment-drives/actions";
import { emptyFormState } from "@/lib/form-state";

const initial: CreateDriveResult = emptyFormState;

/**
 * Admin form to create a new recruitment drive. Lives inline on
 * /admin/fairs (no separate /admin/fairs/new route — keeps the
 * admin's loop tight). On success we router.push to the detail
 * page so they can immediately invite companies + edit hero.
 */
export function CreateFairForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(
    async (prev: CreateDriveResult, fd: FormData) => {
      const r = await createRecruitmentDrive(prev, fd);
      if (r.ok && r.driveId) {
        router.push(`/admin/fairs/${r.driveId}`);
      }
      return r;
    },
    initial,
  );

  return (
    <Card className="p-5">
      <details className="group">
        <summary className="cursor-pointer list-none">
          <h2 className="text-section text-emce-text">
            + Create new drive{" "}
            <span className="text-hint font-normal text-emce-text-muted">
              <span className="group-open:hidden">(click to expand)</span>
              <span className="hidden group-open:inline">(collapse)</span>
            </span>
          </h2>
        </summary>

        {!state.ok && state.message && (
          <div role="alert" className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {state.message}
          </div>
        )}

        <form action={formAction} className="mt-4 space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              required
              minLength={4}
              maxLength={160}
              placeholder="Pune EV Job Fair · June 2026"
            />
          </div>
          <div>
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              name="tagline"
              maxLength={200}
              placeholder="20+ EV companies hiring across battery, charging, motor, software."
            />
          </div>
          <div>
            <Label htmlFor="description">About this fair</Label>
            <RichTextEditor
              id="description"
              name="description"
              placeholder="What candidates can expect — keynotes, on-site interviews, networking, prize draws."
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
                  placeholder="Pune"
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input id="state" name="state" maxLength={120} placeholder="Maharashtra" />
              </div>
              <div>
                <Label htmlFor="venueName">Venue name</Label>
                <Input
                  id="venueName"
                  name="venueName"
                  maxLength={200}
                  placeholder="Pune International Exhibition Center"
                />
              </div>
              <div>
                <Label htmlFor="venueAddress">Venue address</Label>
                <Input
                  id="venueAddress"
                  name="venueAddress"
                  maxLength={500}
                  placeholder="MIDC, Bhosari, Pune 411026"
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
                  placeholder="18.6298"
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
                  placeholder="73.8553"
                />
              </div>
            </div>
            <p className="mt-2 text-hint text-emce-text-muted">
              Tip: Right-click the venue in Google Maps and copy the
              coordinates — paste here for an embedded map on the public page.
            </p>
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
                />
              </div>
              <div>
                <Label htmlFor="endsAt">Ends at *</Label>
                <Input id="endsAt" name="endsAt" type="datetime-local" required />
              </div>
              <div>
                <Label htmlFor="registrationOpensAt">
                  Registration opens <span className="text-emce-text-muted">(optional)</span>
                </Label>
                <Input
                  id="registrationOpensAt"
                  name="registrationOpensAt"
                  type="datetime-local"
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
                />
              </div>
            </div>
          </fieldset>

          <SubmitButton pendingLabel="Creating…">Create drive</SubmitButton>
          <p className="text-hint text-emce-text-muted">
            New drives start as <strong>DRAFT</strong> — invisible to public.
            Invite companies, fill in the hero, then publish from the detail page.
          </p>
        </form>
      </details>
    </Card>
  );
}
