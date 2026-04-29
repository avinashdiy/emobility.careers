import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveAvailability } from "@/server/candidates/actions";

/**
 * LinkedIn-style availability frame picker. Three mutually-exclusive
 * choices — "Looking" sets `openToWork=true / hiringNow=false`,
 * "Hiring" sets `openToWork=false / hiringNow=true`, "Neither" turns
 * both off and the avatar renders without a frame at all.
 *
 * The default schema state for a fresh signup is
 * `openToWork=true / hiringNow=false`, so candidates who never visit
 * this section still show up as Open to work — the form below lets
 * them flip it explicitly when that doesn't match their actual
 * situation (recruiters, founders posting on behalf of their company,
 * or anyone who just doesn't want a public broadcast).
 */
export function AvailabilityEditor({
  openToWork,
  hiringNow,
}: {
  openToWork: boolean;
  hiringNow: boolean;
}) {
  const status: "LOOKING" | "HIRING" | "NONE" = hiringNow
    ? "HIRING"
    : openToWork
      ? "LOOKING"
      : "NONE";

  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Availability frame</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Sets the green "#OpenToWork" or teal "#Hiring" ring around your
        profile photo. Pick one, or hide both.
      </p>
      <form action={saveAvailability} className="space-y-3">
        <Choice
          name="status"
          value="LOOKING"
          checked={status === "LOOKING"}
          title="🔍 Open to work"
          desc="Recruiters can find you in talent search filtered by Open to work. Default for new candidates."
          ringClass="ring-emce-mid"
        />
        <Choice
          name="status"
          value="HIRING"
          checked={status === "HIRING"}
          title="🎯 Hiring now"
          desc="Use this if you're a founder, recruiter, or hiring manager. Replaces the Open-to-work ring with a dark teal Hiring frame."
          ringClass="ring-emce-darkest"
        />
        <Choice
          name="status"
          value="NONE"
          checked={status === "NONE"}
          title="— Hide both"
          desc="Profile photo renders plain — no frame, no chip. Use when you don't want either signal broadcast."
          ringClass=""
        />
        <div className="flex justify-end">
          <Button type="submit">Save frame</Button>
        </div>
      </form>
    </Card>
  );
}

function Choice({
  name,
  value,
  checked,
  title,
  desc,
  ringClass,
}: {
  name: string;
  value: string;
  checked: boolean;
  title: string;
  desc: string;
  ringClass: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition ${
        checked
          ? "border-emce-mid bg-emce-light-soft"
          : "border-emce-border hover:border-emce-mid/50"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        className="mt-0.5 h-4 w-4 accent-emce-darkest"
      />
      <div className="flex-1">
        <div className="text-sm font-bold text-emce-text">{title}</div>
        <div className="text-hint text-emce-text-sec">{desc}</div>
      </div>
      {ringClass && (
        <div className={`h-6 w-6 rounded-full bg-emce-light-soft ring-2 ring-offset-2 ring-offset-white ${ringClass}`} />
      )}
    </label>
  );
}
