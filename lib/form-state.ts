/**
 * Shared shape for `useActionState`-driven forms with per-field validation.
 * Server actions return one of these; client forms render field errors inline.
 */
export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

export const emptyFormState: FormState = { ok: false };

/** Convert a Zod error to FormState fieldErrors. */
export function zodErrorsToFieldErrors(
  formattedFlatten: { fieldErrors: Record<string, string[] | undefined> },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(formattedFlatten.fieldErrors)) {
    if (v && v[0]) out[k] = v[0];
  }
  return out;
}
