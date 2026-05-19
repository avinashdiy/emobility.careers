import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Sign-up wall rendered below the photo+name hero on a candidate /
 * employer-person public profile when the viewer is NOT logged in.
 *
 * Pattern mirrors LinkedIn's "Sign in to see full profile" wall:
 *
 *   1. The page header (banner, avatar, full name) renders normally
 *      above the fold — gives the visitor enough signal to confirm
 *      they landed on the right person.
 *
 *   2. Everything below (about, experience, skills, education,
 *      contact) is replaced by this component — a blurred skeleton
 *      preview + a centered signup CTA card overlay. The blur is
 *      decorative (no real PII is sent to the client for logged-out
 *      requests — the server simply doesn't fetch + render the
 *      sections), so DevTools can't bypass it to read content.
 *
 *   3. Sign-up / sign-in CTAs carry a `?next=` so post-auth lands
 *      the visitor right back on this profile.
 *
 * Why this lives in its own component:
 *   • The same wall will be reused on other personal-profile
 *     surfaces (mentor profile gate-toggle, future recruiter-page
 *     gate, etc.) — single source of truth keeps the copy + visual
 *     consistent across surfaces.
 *   • A non-technical edit to the messaging (e.g. updating the
 *     "world's largest EV network" tagline once we cross 100k
 *     users) is one file, not N.
 *
 * Crawler / SEO note: search engines hit this page logged-out, so
 * they see exactly what a visitor sees — name + this wall. We
 * accept the indexable-content reduction; the `metadata.description`
 * in `app/[username]/page.tsx` carries enough headline context to
 * surface the page in SERPs, and the wall converts the click into
 * a signup. This is the LinkedIn trade-off.
 */

interface ProfilePaywallProps {
  /** Full name of the person — used in the CTA copy
   *  ("Sign up to see [name]'s full profile"). */
  displayName: string;
  /**
   * Path to redirect the user back to after sign-up / sign-in. Should
   * be the slug-only profile path (e.g. `/samuel-okello`), NOT a full
   * URL — the auth flow's `?next=` validates against same-origin
   * relative paths and would reject an http(s) prefix.
   */
  returnPath: string;
  /**
   * `"candidate"` vs `"employer"` only changes the copy in the CTA
   * card ("EV-industry engineers & mentors" vs "EV-industry
   * recruiters & hiring managers"). The shape of the wall is
   * identical.
   */
  variant?: "candidate" | "employer";
}

export function ProfilePaywall({
  displayName,
  returnPath,
  variant = "candidate",
}: ProfilePaywallProps) {
  // `?next=` value — URL-encoded so a slug with `&`, spaces, or
  // unicode (e.g. /priya-r-iit-bombay) round-trips cleanly through
  // the auth redirect chain.
  const next = encodeURIComponent(returnPath);

  // Variant-specific copy in the secondary line. Kept tight so the
  // CTA stays scannable.
  const secondaryLine =
    variant === "employer"
      ? "Connect with EV-industry recruiters, hiring managers, and the engineers they're hiring."
      : "Connect with EV-industry engineers, recruiters, and mentors across battery, charging, motors, and powertrain.";

  return (
    <div className="relative mx-auto mt-3 max-w-5xl px-4 sm:mt-4">
      {/* ── Blurred skeleton preview ──
          Renders the *shape* of the profile body (About,
          Experience, Skills, Education, Contact) so visitors
          understand what they'd unlock. Block characters (██)
          are decorative — never real PII. `aria-hidden`,
          `select-none`, `pointer-events-none` so screen-readers,
          copy-paste, and accidental clicks all bypass it. */}
      <div
        className="pointer-events-none select-none space-y-3 blur-[6px]"
        aria-hidden="true"
      >
        {/* About */}
        <Card>
          <div className="text-section font-bold text-emce-text">About</div>
          <p className="mt-2 text-emce-text-sec">
            ████████████ ███████ ██████████ ████████ ███ ████ ███████████
            █████████ ███████ ████ ███████████ ██████ ████████ ██████ █████
            ███████████ ████████ █████ ████████ ████ ██████████ ██████.
          </p>
        </Card>

        {/* Experience */}
        <Card>
          <div className="text-section font-bold text-emce-text">Experience</div>
          <div className="mt-3 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-md bg-emce-light-soft" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 rounded bg-emce-light-soft" />
                  <div className="h-3 w-36 rounded bg-emce-light-soft/70" />
                  <div className="h-2.5 w-24 rounded bg-emce-light-soft/50" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Skills */}
        <Card>
          <div className="text-section font-bold text-emce-text">Skills</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "████████",
              "███████ ████",
              "█████████",
              "██████ ████",
              "████████ ████",
              "███████",
              "██████ ███████",
              "████ ████",
            ].map((s, i) => (
              <div
                key={i}
                className="rounded-full bg-emce-light-soft px-3 py-1 text-xs"
              >
                {s}
              </div>
            ))}
          </div>
        </Card>

        {/* Education */}
        <Card>
          <div className="text-section font-bold text-emce-text">Education</div>
          <div className="mt-3 space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-10 w-10 flex-shrink-0 rounded-md bg-emce-light-soft" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-56 rounded bg-emce-light-soft" />
                  <div className="h-3 w-40 rounded bg-emce-light-soft/70" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Contact */}
        <Card>
          <div className="text-section font-bold text-emce-text">Contact</div>
          <div className="mt-2 space-y-1.5">
            <div className="text-emce-text-sec">📧 ████████@█████████.████</div>
            <div className="text-emce-text-sec">📞 +██ █████ █████ ██</div>
            <div className="text-emce-text-sec">📍 ██████, █████</div>
          </div>
        </Card>
      </div>

      {/* ── Centered signup overlay ──
          Floats above the blurred preview. We use sticky positioning
          inside an absolute outer so the card stays in view on
          long-scroll devices, but doesn't escape the wall vertically.
          Pointer events explicitly re-enabled (the parent blur layer
          set them to none). */}
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-10 sm:pt-16">
        <div className="pointer-events-auto sticky top-24 w-full max-w-md">
          <Card className="border-2 border-emce-dark/25 shadow-emce-lg">
            <div className="text-center">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emce-light-bg text-2xl">
                ⚡
              </div>
              <h2 className="mt-3 text-section font-extrabold leading-tight text-emce-text">
                Join the world&apos;s largest Electric Vehicle Professionals
                Network
              </h2>
              <p className="mt-2 text-hint text-emce-text-sec">
                Sign up to see {displayName}&apos;s full profile — experience,
                skills, certifications, and contact. {secondaryLine}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button asChild size="lg" className="w-full">
                  <Link href={`/signup?next=${next}`}>Join now — it&apos;s free</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <Link href={`/signin?next=${next}`}>
                    Already a member? Sign in
                  </Link>
                </Button>
              </div>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-emce-text-muted">
                Battery · Charging · Powertrain · Motors · OEM
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
