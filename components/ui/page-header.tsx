import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Standardised page header — the LinkedIn pattern: title on the left,
 * actions on the right, optional subtitle on the line below the title.
 * Replaces the ~15 ad-hoc <h1> + <p> + <div> trios scattered across
 * /me, /tpo, /employer, /admin, /campus pages.
 *
 * Use it like:
 *   <PageHeader
 *     eyebrow="Placement"
 *     title="Cohort dashboard"
 *     subtitle="EV Powertrain — Mar 2025"
 *     backHref="/tpo/cohorts"
 *     actions={<Button>Edit</Button>}
 *   />
 *
 * Density follows the LinkedIn pattern at md+ (3xl title, single line of
 * subtitle), tightening on mobile so it doesn't crowd the rest of the
 * page.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Small uppercase label above the title — "Placement", "Hiring", etc. */
  eyebrow?: string;
  /** When set, renders an arrow link above the title for nav back. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned slot — buttons, status pills, etc. */
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0 flex-1">
        {backHref && (
          <Link
            href={backHref}
            className="mb-1 inline-flex items-center gap-1 text-hint font-bold text-emce-dark hover:underline"
          >
            ← {backLabel ?? "Back"}
          </Link>
        )}
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-wide text-emce-text-sec">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-emce-text-sec">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Section title — for the smaller "Stage funnel" / "Roster" / "About"
 * blocks that live inside cards. Keeps the type scale + spacing
 * consistent so a recruiter scanning between sections doesn't feel
 * like hierarchy is shifting underneath them.
 */
export function SectionTitle({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-2", className)}>
      <div className="min-w-0 flex-1">
        <h2 className="text-section text-emce-text">{title}</h2>
        {description && (
          <p className="mt-0.5 text-hint text-emce-text-sec">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
