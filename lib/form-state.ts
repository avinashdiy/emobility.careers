/**
 * Shared shape for `useActionState`-driven forms with per-field validation.
 * Server actions return one of these; client forms render field errors inline.
 */
export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /// Round-trip of every submitted FormData entry as plain strings.
  /// Lets multi-field forms re-mount with the user's typing intact
  /// after a validation failure — same defaultValue source for
  /// both first paint AND error-recovery paint.
  prevValues?: Record<string, string>;
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

/**
 * Snapshot every string entry in a FormData payload so the action
 * can echo it back to the form as `prevValues`. Skips File entries
 * (uploads can't be serialised). Use this on every validation-
 * failure branch so the user never has to re-type a multi-field
 * form after a single-field error.
 */
export function snapshotFormData(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
