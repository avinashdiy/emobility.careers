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
 *
 * Vibe pass: PageHeader now animates in by default (one-shot
 * fade-up) and the title font moves to `font-extrabold` with a tighter
 * tracking. The eyebrow gets the brand `emce-mid` colour so it pops
 * against the neutral body text without us touching every consuming
 * page. Pass `animate={false}` to opt out (use case: pages where the
 * header is below an animated hero that's already drawing the eye).
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  backHref,
  backLabel,
  actions,
  className,
  animate = true,
  /**
   * Optional accent gradient applied to specific words in the title —
   * pass a substring that exists inside `title` and it'll be rendered
   * with `emce-text-gradient`. Single accent per header — keep it
   * scarce so it stays a signal, not noise.
   */
  accent,
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
  /** One-shot fade-up entry. Default true. */
  animate?: boolean;
  /** Substring of `title` to render in the brand gradient. */
  accent?: string;
}) {
  const titleNode =
    accent && title.includes(accent) ? (
      <>
        {title.split(accent)[0]}
        <span className="emce-text-gradient">{accent}</span>
        {title.split(accent)[1]}
      </>
    ) : (
      title
    );

  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        animate && "animate-fade-up",
        className,
      )}
    >
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
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emce-mid-muted">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-emce-text md:text-[28px]">
          {titleNode}
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
