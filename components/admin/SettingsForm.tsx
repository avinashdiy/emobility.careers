"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { saveSettings } from "@/server/admin/settings-actions";
import { emptyFormState } from "@/lib/form-state";
import type { SettingDefinition } from "@/lib/settings";

interface Props {
  category: SettingDefinition["category"];
  title: string;
  description?: string;
  definitions: SettingDefinition[];
  values: Record<string, string>;
}

export function SettingsForm({ category, title, description, definitions, values }: Props) {
  const [state, formAction] = useActionState(saveSettings, emptyFormState);

  return (
    <Card>
      <div>
        <h2 className="text-section text-emce-text">{title}</h2>
        {description && <p className="mt-1 text-hint text-emce-text-sec">{description}</p>}
      </div>
      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="__category" value={category} />

        {state.message && (
          <div role="alert" className={`rounded-md p-3 text-sm ${state.ok ? "bg-emce-light-soft text-emce-darkest" : "bg-emce-red-light text-emce-red"}`}>
            {state.message}
          </div>
        )}

        {definitions.map((def) => (
          <Field key={def.key} def={def} value={values[def.key] ?? def.default} error={state.fieldErrors?.[def.key]} />
        ))}

        <SubmitButton pendingLabel="Saving…">Save {title.toLowerCase()}</SubmitButton>
      </form>
    </Card>
  );
}

function Field({ def, value, error }: { def: SettingDefinition; value: string; error?: string }) {
  if (def.type === "BOOLEAN") {
    const checked = value === "true";
    return (
      <div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            name={def.key}
            defaultChecked={checked}
            className="mt-0.5 h-4 w-4 rounded border-emce-border"
          />
          <span>
            <span className="text-sm font-bold text-emce-text">{def.label}</span>
            {def.description && <span className="ml-2 text-hint text-emce-text-sec">{def.description}</span>}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={def.key}>{def.label}</Label>
      {def.type === "TEXT" ? (
        <Textarea
          id={def.key}
          name={def.key}
          defaultValue={value}
          rows={def.key.includes("signature") ? 4 : 3}
          aria-invalid={!!error}
        />
      ) : (
        <Input
          id={def.key}
          name={def.key}
          defaultValue={value}
          type={def.type === "EMAIL" ? "email" : def.type === "URL" ? "url" : def.type === "NUMBER" ? "number" : "text"}
          inputMode={def.type === "NUMBER" ? "numeric" : undefined}
          aria-invalid={!!error}
          autoComplete="off"
          spellCheck={def.type === "STRING"}
        />
      )}
      {def.description && <p className="mt-1 text-hint text-emce-text-sec">{def.description}</p>}
      <FieldError error={error} />
    </div>
  );
}
