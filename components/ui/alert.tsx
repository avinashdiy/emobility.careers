import * as React from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  XCircle,
} from "lucide-react";

/**
 * Inline callout / banner / alert primitive. The audit found that
 * "rounded-md bg-emce-orange-light p-3 text-sm" and friends are
 * scattered across ~30 files as ad-hoc divs — every error banner,
 * warning, "tip", and inline notice rolled its own styling.
 * That's exactly what a primitive is for.
 *
 * Variants:
 *   • info     — neutral / instructional tone (blue-ish, leans on
 *                  emce-light-soft so it matches the system).
 *   • success — positive confirmation (light green).
 *   • warning — needs-attention but not destructive (orange).
 *   • danger  — error or destructive consequence (red).
 *
 * Each variant carries its own icon by default — callers can swap
 * with `icon={CustomIcon}` or pass `icon={null}` to omit. role
 * defaults to "alert" for warning/danger (announced by screen
 * readers immediately) and "status" for info/success (announced
 * politely so the user isn't interrupted).
 */
type Variant = "info" | "success" | "warning" | "danger";

const STYLES: Record<Variant, { wrap: string; icon: string; iconComponent: LucideIcon }> = {
  info: {
    wrap: "border-emce-mid/30 bg-emce-light-soft/60 text-emce-text",
    icon: "text-emce-dark",
    iconComponent: Info,
  },
  success: {
    wrap: "border-emce-mid/40 bg-emce-light-soft text-emce-darkest",
    icon: "text-emce-dark",
    iconComponent: CheckCircle2,
  },
  warning: {
    wrap: "border-emce-orange/40 bg-emce-orange-light/60 text-emce-text",
    icon: "text-emce-orange-deep",
    iconComponent: AlertTriangle,
  },
  danger: {
    wrap: "border-emce-red/30 bg-emce-red-light text-emce-red-deep",
    icon: "text-emce-red-deep",
    iconComponent: XCircle,
  },
};

// HTMLAttributes carries `title?: string` (the HTML tooltip
// attr). We override with a richer ReactNode `title` prop, so
// we Omit the native one to avoid the type conflict.
export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: Variant;
  /// Pass a custom Lucide icon component, or `null` to omit the
  /// icon entirely (useful for very compact callouts).
  icon?: LucideIcon | null;
  /// When set, renders as the first line in bold above `children`.
  /// Useful when the callout has a one-line headline + supporting
  /// detail.
  title?: React.ReactNode;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ variant = "info", icon, title, className, children, role, ...props }, ref) => {
    const s = STYLES[variant];
    const Icon = icon === null ? null : (icon ?? s.iconComponent);
    const resolvedRole =
      role ?? (variant === "warning" || variant === "danger" ? "alert" : "status");
    return (
      <div
        ref={ref}
        role={resolvedRole}
        className={cn(
          "flex items-start gap-2.5 rounded-md border p-3 text-sm",
          s.wrap,
          className,
        )}
        {...props}
      >
        {Icon && <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", s.icon)} aria-hidden />}
        <div className="min-w-0 flex-1">
          {title && <p className="font-bold">{title}</p>}
          {children && (
            <div className={cn(title ? "mt-0.5" : "", "text-current/90")}>
              {children}
            </div>
          )}
        </div>
      </div>
    );
  },
);
Alert.displayName = "Alert";
