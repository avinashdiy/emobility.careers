import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LEGAL, LEGAL_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Accessibility statement",
  description: `How ${LEGAL.brand} approaches digital accessibility — WCAG 2.1 AA target, the features we ship, known gaps, and how to report a barrier.`,
};

/**
 * Accessibility statement — the page that was 404ing.
 *
 * Standard public legal-adjacent page (same shape as
 * /privacy and /terms): clear contact for reporting issues,
 * concrete commitments, and a known-limitations section so
 * we're not over-promising. Footer links here from the site
 * footer (added in the related navigation pass).
 */
export default function AccessibilityPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">Accessibility</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Accessibility statement
      </h1>
      <p className="mt-2 text-hint text-emce-text-muted">
        Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <section className="mt-8 space-y-4 text-body text-emce-text-sec">
        <p>
          <strong>{LEGAL.brand}</strong> is built to be usable by everyone in
          India&apos;s electric-vehicle industry — including candidates who use
          screen readers, keyboard-only navigation, or assistive tech. We treat
          accessibility as a product requirement, not an afterthought.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">Our target</h2>
        <p className="mt-3 text-body text-emce-text-sec">
          We design and engineer toward <strong>WCAG 2.1 Level AA</strong>.
          Every release passes an automated axe-core audit on the highest-
          traffic surfaces (the home page, job browse, candidate profile, job
          detail, and the application flow). The audit runs as part of our CI
          pipeline so regressions don&apos;t ship silently.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">What we&apos;ve done</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-body text-emce-text-sec">
          <li>
            <strong>Colour contrast.</strong> Every text + background
            combination on the public site clears the WCAG AA contrast
            threshold (4.5:1 for normal text, 3:1 for large text). The brand
            palette ships explicit{" "}
            <code>-deep</code> variants of the accent colours specifically for
            text foregrounds.
          </li>
          <li>
            <strong>Keyboard navigation.</strong> Every interactive control —
            menus, modals, the application form, the kanban pipeline — is
            reachable and operable with the keyboard alone. Focus rings are
            visible and high-contrast.
          </li>
          <li>
            <strong>Skip-to-content link.</strong> Every page exposes a
            keyboard-only skip link at the top so screen-reader and keyboard
            users don&apos;t have to tab through the full navigation on every
            visit.
          </li>
          <li>
            <strong>Semantic structure.</strong> Headings (
            <code>&lt;h1&gt;</code> through <code>&lt;h6&gt;</code>) are used
            for document outline, not visual size. Landmarks (
            <code>&lt;header&gt;</code>, <code>&lt;main&gt;</code>,{" "}
            <code>&lt;nav&gt;</code>, <code>&lt;footer&gt;</code>) wrap the
            corresponding regions on every page.
          </li>
          <li>
            <strong>Image alt text.</strong> Every meaningful image has a
            descriptive <code>alt</code> attribute. Decorative images are
            marked <code>aria-hidden</code> so assistive tech doesn&apos;t
            announce them.
          </li>
          <li>
            <strong>Forms.</strong> Every input has an associated{" "}
            <code>&lt;label&gt;</code>. Validation errors are announced via{" "}
            <code>role=&quot;alert&quot;</code> and tied to the specific field
            via <code>aria-invalid</code> + <code>aria-describedby</code>, so a
            screen reader names the broken field on submit.
          </li>
          <li>
            <strong>Touch targets.</strong> Interactive controls are at least
            44 × 44 px on mobile — the floor mobile-WCAG recommends for
            comfortable thumb tapping.
          </li>
          <li>
            <strong>Reduced motion.</strong> Animations honour{" "}
            <code>prefers-reduced-motion</code>. The verified-badge
            shimmer, the &ldquo;LIVE&rdquo; ticker pulse, and the
            kanban-drag visuals fade out or stop entirely for users who&apos;ve
            asked their OS to limit motion.
          </li>
          <li>
            <strong>Hindi + nine other languages.</strong> A page-level Google
            Translate widget covers Hindi, Tamil, Telugu, Marathi, Bengali,
            Gujarati, Kannada, German, Arabic, Chinese, French and Japanese —
            available on every public page via the language selector in the
            header.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">Known limitations</h2>
        <p className="mt-3 text-body text-emce-text-sec">
          We&apos;re honest about where we&apos;re still working:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-body text-emce-text-sec">
          <li>
            <strong>Drag-and-drop kanban (employer ATS).</strong> Moving
            candidate cards between pipeline stages works fully with the
            keyboard, but the screen-reader announcement of the drop target is
            currently terse. Improving the live-region announcements is on the
            roadmap.
          </li>
          <li>
            <strong>Embedded video.</strong> User-uploaded video content (in
            posts and competition submissions) doesn&apos;t yet have
            automatically generated captions. We&apos;re evaluating a Whisper-
            backed captioning step for the upload pipeline.
          </li>
          <li>
            <strong>Charts on /pulse + /salaries.</strong> The visual charts
            are paired with a text summary of the same data, but the SVGs
            themselves don&apos;t expose individual data points to screen
            readers. Adding <code>aria-label</code>s + a tabular fallback view
            is pending.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">
          Report a barrier or request an alternative format
        </h2>
        <p className="mt-3 text-body text-emce-text-sec">
          If anything on the site is hard to use — a missing label, a low-
          contrast element, a keyboard trap, or a flow that doesn&apos;t work
          with your assistive tech — please tell us. We treat accessibility
          reports as we treat security reports: triaged within one business day,
          fixed promptly.
        </p>
        <div className="mt-4 rounded-md border border-emce-border bg-emce-light-soft p-4">
          <p className="text-sm text-emce-text">
            <strong>Email:</strong>{" "}
            <a
              href={`mailto:${LEGAL.emails.support}`}
              className="font-bold text-emce-dark hover:underline"
            >
              {LEGAL.emails.support}
            </a>
          </p>
          <p className="mt-1 text-sm text-emce-text">
            <strong>Phone:</strong>{" "}
            <a
              href={`tel:${LEGAL.phones.support}`}
              className="font-bold text-emce-dark hover:underline"
            >
              {LEGAL.phones.supportDisplay}
            </a>{" "}
            ({LEGAL.hours})
          </p>
          <p className="mt-2 text-hint text-emce-text-muted">
            Include the URL of the page, the assistive tech you&apos;re using,
            and a short description of what you tried to do — that&apos;s
            usually enough for us to reproduce.
          </p>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">How we test</h2>
        <ul className="mt-3 list-disc space-y-2 pl-6 text-body text-emce-text-sec">
          <li>
            Automated axe-core scans on every pull request — surfaces colour
            contrast, missing labels, and ARIA misuse before merge.
          </li>
          <li>
            Manual keyboard-only passes on signup, profile editor, job apply,
            and the employer ATS once per release cycle.
          </li>
          <li>
            Periodic screen-reader testing with VoiceOver (macOS / iOS) and
            NVDA (Windows) on the top user journeys.
          </li>
          <li>
            Lighthouse + Pingdom + GTmetrix runs after every production
            deploy — accessibility is one of the four scores we track.
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-section text-emce-text">Standards we follow</h2>
        <p className="mt-3 text-body text-emce-text-sec">
          This site is built to conform with{" "}
          <a
            href="https://www.w3.org/TR/WCAG21/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-emce-dark hover:underline"
          >
            WCAG 2.1 Level AA
          </a>{" "}
          and references the relevant sections of India&apos;s{" "}
          <a
            href="https://www.disabilityaffairs.gov.in/upload/uploadfiles/files/RPWD%20ACT%202016.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-emce-dark hover:underline"
          >
            Rights of Persons with Disabilities Act, 2016
          </a>{" "}
          for digital service accessibility.
        </p>
      </section>

      <div className="mt-12 border-t border-emce-border pt-6">
        <p className="text-sm text-emce-text-sec">
          See also:{" "}
          <Link href="/privacy" className="font-bold text-emce-dark hover:underline">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="font-bold text-emce-dark hover:underline">
            Terms of Use
          </Link>{" "}
          ·{" "}
          <Link href="/grievance" className="font-bold text-emce-dark hover:underline">
            Grievance Redressal
          </Link>
        </p>
      </div>
    </div>
  );
}
