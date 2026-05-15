import * as React from "react";
import { cn } from "@/lib/utils";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /// When true, renders a small red asterisk after the label text +
  /// an aria-hidden "required" sentence for screen readers. Inputs
  /// with `required` set their own aria-required, so this is a
  /// purely visual affordance — most users glance at the asterisk
  /// before submitting. We keep it opt-in (rather than reading the
  /// child input's `required` automatically) so callers can hide it
  /// in compact contexts (e.g. inline edit cells where the field is
  /// obviously required by context).
  required?: boolean;
  /// Renders "(optional)" in muted secondary text after the label.
  /// Mutually exclusive with `required` — pick one. Useful for
  /// fields that look mandatory but aren't (e.g. tagline, faculty
  /// email).
  optional?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, optional, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "mb-1 block text-xs font-bold uppercase tracking-wide text-emce-text-sec",
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <>
          {" "}
          <span aria-hidden className="text-emce-red-deep">
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
      {optional && (
        <span className="ml-1 font-normal lowercase tracking-normal text-emce-text-muted">
          (optional)
        </span>
      )}
    </label>
  ),
);
Label.displayName = "Label";
