import type { CandidateProfile } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveHeader } from "@/server/candidates/actions";

export function HeaderEditor({ profile }: { profile: CandidateProfile }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Headline &amp; about</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        This is the first thing employers see on your public profile.
      </p>
      <form action={saveHeader} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required defaultValue={profile.firstName} />
        </div>
        <div>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" defaultValue={profile.lastName ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="headline">Headline</Label>
          <Input
            id="headline"
            name="headline"
            defaultValue={profile.headline ?? ""}
            placeholder="e.g. Battery Pack Engineer | Cell chemistry, BMS"
            maxLength={160}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="summary">About you</Label>
          <Textarea
            id="summary"
            name="summary"
            defaultValue={profile.summary ?? ""}
            placeholder="2–4 sentences on what you build and what you're looking for."
            maxLength={2000}
            rows={4}
          />
        </div>
        <div>
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue={profile.location ?? ""} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={profile.phone ?? ""} />
          <p className="mt-1 text-hint text-emce-text-muted">
            Recruiters can reach you on WhatsApp via this number — visibility is controlled in <strong>Privacy</strong> below.
          </p>
        </div>
        <div>
          <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
          <Input id="linkedinUrl" name="linkedinUrl" type="url" defaultValue={profile.linkedinUrl ?? ""} />
        </div>
        <div>
          <Label htmlFor="githubUrl">GitHub URL</Label>
          <Input id="githubUrl" name="githubUrl" type="url" defaultValue={profile.githubUrl ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="portfolioUrl">Portfolio / website</Label>
          <Input id="portfolioUrl" name="portfolioUrl" type="url" defaultValue={profile.portfolioUrl ?? ""} />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </Card>
  );
}
