import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { setLanguages } from "@/server/candidates/actions";

export function LanguagesEditor({ languages }: { languages: string[] }) {
  return (
    <Card>
      <h2 className="text-section text-emce-text">Languages</h2>
      <p className="mb-4 text-hint text-emce-text-sec">
        Languages you can read / write / speak — comma-separated. Example: <em>English, Hindi, Tamil, Marathi</em>
      </p>
      <form action={setLanguages} className="grid gap-3 sm:grid-cols-12">
        <div className="sm:col-span-10">
          <Label htmlFor="languages" className="sr-only">Languages</Label>
          <Input
            id="languages"
            name="languages"
            defaultValue={languages.join(", ")}
            placeholder="English, Hindi, ..."
          />
        </div>
        <div className="sm:col-span-2 flex items-end">
          <SubmitButton className="w-full" pendingLabel="Saving…">Save</SubmitButton>
        </div>
      </form>
    </Card>
  );
}
