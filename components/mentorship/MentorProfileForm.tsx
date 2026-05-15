"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { upsertMentorProfile } from "@/server/mentorship/actions";
import { emptyFormState } from "@/lib/form-state";

interface Props {
  initial: {
    headline?: string;
    bio?: string;
    expertiseTags?: string[];
    evDomainSlugs?: string[];
    languages?: string[];
    yearsExperience?: number;
    pricePerSessionMinor?: number;
    currency?: string;
    acceptingFree?: boolean;
    acceptingPaid?: boolean;
    sessionDurations?: number[];
    bufferMinutes?: number;
    defaultMode?: "VIDEO" | "PHONE" | "CHAT";
  };
  evDomains: { slug: string; name: string }[];
}

export function MentorProfileForm({ initial, evDomains }: Props) {
  const [state, formAction] = useActionState(upsertMentorProfile, emptyFormState);
  return (
    <Card>
      <h2 className="text-section text-emce-text">Mentor profile</h2>
      <p className="text-hint text-emce-text-sec">
        This is what mentees see in the directory. Pricing, availability, and KYC are separate steps.
      </p>
      <form action={formAction} className="mt-4 space-y-4" noValidate>
        {state.message && (
          <div role="alert" className={`rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft text-emce-darkest" : "bg-emce-red-light text-emce-red-deep"}`}>
            {state.message}
          </div>
        )}
        <div>
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            name="headline"
            defaultValue={initial.headline ?? ""}
            placeholder="Senior Battery Engineer · 12yr · BMS firmware"
            maxLength={140}
            required
            aria-invalid={!!state.fieldErrors?.headline}
          />
          <FieldError error={state.fieldErrors?.headline} />
        </div>
        <div>
          <Label htmlFor="bio">Bio</Label>
          <RichTextEditor
            id="bio"
            name="bio"
            defaultValue={initial.bio ?? ""}
            placeholder="What you've built. What kind of mentees you'd love to help."
            required
            minHeight={200}
            ariaInvalid={!!state.fieldErrors?.bio}
          />
          <FieldError error={state.fieldErrors?.bio} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="expertiseTags">Expertise tags (comma-separated)</Label>
            <Input
              id="expertiseTags"
              name="expertiseTags"
              defaultValue={(initial.expertiseTags ?? []).join(", ")}
              placeholder="bms, powertrain, embedded-c"
            />
          </div>
          <div>
            <Label htmlFor="languages">Languages (one per line)</Label>
            <NativeSelect id="languages" name="languages" multiple defaultValue={initial.languages ?? ["en"]} className="h-20">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
              <option value="kn">Kannada</option>
              <option value="mr">Marathi</option>
              <option value="bn">Bengali</option>
              <option value="gu">Gujarati</option>
            </NativeSelect>
          </div>
        </div>

        <div>
          <Label htmlFor="evDomainSlugs">EV domains</Label>
          <NativeSelect
            id="evDomainSlugs"
            name="evDomainSlugs"
            multiple
            defaultValue={initial.evDomainSlugs ?? []}
            className="h-32"
          >
            {evDomains.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </NativeSelect>
          <p className="mt-1 text-hint text-emce-text-sec">Cmd-click / Ctrl-click for multiple.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="yearsExperience">Years of experience</Label>
            <Input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={60}
              defaultValue={initial.yearsExperience ?? 0}
              required
            />
          </div>
          <div>
            <Label htmlFor="defaultMode">Default mode</Label>
            <NativeSelect id="defaultMode" name="defaultMode" defaultValue={initial.defaultMode ?? "VIDEO"}>
              <option value="VIDEO">Video</option>
              <option value="PHONE">Phone</option>
              <option value="CHAT">Chat</option>
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="bufferMinutes">Buffer between sessions (min)</Label>
            <Input
              id="bufferMinutes"
              name="bufferMinutes"
              type="number"
              min={0}
              max={60}
              defaultValue={initial.bufferMinutes ?? 15}
            />
          </div>
        </div>

        <div>
          <Label>Session durations offered</Label>
          <div className="mt-1 flex gap-3 text-sm">
            {[15, 30, 45, 60, 90].map((d) => (
              <label key={d} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  name="sessionDurations"
                  value={d}
                  defaultChecked={(initial.sessionDurations ?? [30, 45, 60]).includes(d)}
                />
                {d} min
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-emce border border-emce-border p-3">
          <Label>Pricing</Label>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="acceptingFree" value="on" defaultChecked={initial.acceptingFree ?? false} />
                  Accept free sessions
                </label>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="acceptingPaid" value="on" defaultChecked={initial.acceptingPaid ?? false} />
                  Accept paid sessions
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pricePerSessionMinor">Price (paise)</Label>
                <Input
                  id="pricePerSessionMinor"
                  name="pricePerSessionMinor"
                  type="number"
                  min={0}
                  defaultValue={initial.pricePerSessionMinor ?? 0}
                  placeholder="50000 = ₹500"
                />
              </div>
              <div>
                <Label htmlFor="currency">Currency</Label>
                <NativeSelect id="currency" name="currency" defaultValue={initial.currency ?? "INR"}>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </div>
            </div>
          </div>
          <p className="mt-2 text-hint text-emce-text-sec">
            Amount is in minor units — for ₹500 enter 50000. We charge 0% platform fee in v1.
          </p>
        </div>

        <SubmitButton size="lg" pendingLabel="Saving…">Save profile</SubmitButton>
      </form>
    </Card>
  );
}
