"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

interface ConfirmSubmitProps extends Omit<ButtonProps, "type"> {
  /** Message shown in the native confirm dialog. */
  confirm: string;
  pendingLabel?: string;
}

/**
 * Form submit button that asks for confirmation before allowing the action.
 * Uses the browser's native confirm() — fast, accessible, no portal needed.
 *
 *   <form action={withdrawApplication}>
 *     <ConfirmSubmit confirm="Withdraw your application?" variant="destructive">
 *       Withdraw
 *     </ConfirmSubmit>
 *   </form>
 */
export function ConfirmSubmit({
  children,
  confirm,
  pendingLabel,
  disabled,
  onClick,
  ...props
}: ConfirmSubmitProps) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      onClick={(e) => {
        if (!window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...props}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
