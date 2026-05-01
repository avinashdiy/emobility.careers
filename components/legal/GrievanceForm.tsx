"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { toast } from "sonner";
import { fileGrievance } from "@/server/grievance/actions";

const CATEGORIES = [
  "Privacy / personal data",
  "Harassment / abuse on the platform",
  "Misleading content / scam",
  "Account access / authentication",
  "Payment / billing",
  "Other",
];

export function GrievanceForm() {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState<{ ticketId: string } | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const r = await fileGrievance(formData);
        if (r.ok) {
          toast.success(r.message);
          setSubmitted({ ticketId: r.ticketId ?? "" });
        } else {
          toast.error(r.message);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[grievance] file failed", err);
        toast.error("Couldn't file the grievance — please try again.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-md bg-emce-mid/10 p-4 text-sm text-emce-text">
        <strong>Ticket {submitted.ticketId.slice(-8)} logged.</strong>{" "}
        We've emailed you a confirmation. Quote this id when corresponding
        with our team.
      </div>
    );
  }

  return (
    <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-1">
        <Label htmlFor="grv-name">Your name</Label>
        <Input id="grv-name" name="filerName" required minLength={2} maxLength={120} />
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor="grv-email">Your email</Label>
        <Input
          id="grv-email"
          name="filerEmail"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor="grv-phone">Phone (optional)</Label>
        <Input id="grv-phone" name="filerPhone" type="tel" maxLength={30} />
      </div>
      <div className="sm:col-span-1">
        <Label htmlFor="grv-cat">Category</Label>
        <NativeSelect id="grv-cat" name="category" defaultValue="">
          <option value="">— Select —</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="grv-subject">Subject</Label>
        <Input
          id="grv-subject"
          name="subject"
          required
          minLength={4}
          maxLength={200}
          placeholder="One-line summary"
        />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="grv-body">Details</Label>
        <Textarea
          id="grv-body"
          name="body"
          required
          minLength={20}
          maxLength={2000}
          rows={6}
          placeholder="What happened, when, and what outcome you'd like. Include URLs / screenshot links if relevant."
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Filing…" : "File grievance"}
        </Button>
      </div>
    </form>
  );
}
