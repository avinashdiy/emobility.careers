import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCustomCta } from "@/server/candidates/actions";

/**
 * Free-text "custom CTA" chip — LinkedIn-style "#Mentor",
 * "Available for freelance", "Open to relocate", "Fundraising", etc.
 * Renders as a small chip next to the candidate's name on their
 * public profile. Empty value clears it.
 */
export function CustomCtaEditor({ value }: { value: string | null }) {
  return (
    <Card className="p-6">
      <h2 className="text-section text-emce-text">Custom profile chip</h2>
      <p className="mb-3 text-hint text-emce-text-sec">
        A 1–3 word callout shown next to your name on your public
        profile. Use it for things the standard fields don&apos;t cover —
        examples: &quot;Available for freelance&quot;, &quot;Open to relocate&quot;,
        &quot;Fundraising&quot;, &quot;Speaking at events&quot;.
      </p>
      <form action={saveCustomCta} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="customCta">Custom CTA</Label>
          <Input
            id="customCta"
            name="customCta"
            defaultValue={value ?? ""}
            maxLength={160}
            placeholder="Available for freelance"
          />
        </div>
        <Button type="submit" className="shrink-0 sm:mb-0">
          Save chip
        </Button>
      </form>
    </Card>
  );
}
