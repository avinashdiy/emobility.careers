"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

interface SubmitButtonProps extends Omit<ButtonProps, "type"> {
  pendingLabel?: string;
}

/**
 * Form submit button that automatically disables and shows a pending label
 * while the surrounding server action is running.
 *
 *   <form action={save}>
 *     <SubmitButton>Save changes</SubmitButton>
 *   </form>
 *
 * A11y (V2): the button gets `aria-busy` + `aria-live="polite"` while
 * pending so screen-reader users hear the label flip from "Save changes"
 * to "Saving…" instead of silently re-reading the original. Pairs with
 * the broader live-region sweep on AI surfaces — see CareerExplorerForm,
 * SkillAssessmentRunner, and the AI Summary panel.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-live="polite"
      {...props}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
