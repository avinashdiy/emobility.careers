import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { LEGAL, formatAddress, LEGAL_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `Terms governing your use of ${LEGAL.brand}.`,
};

export default function TermsPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">Legal</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Terms of Service
      </h1>
      <p className="mt-2 text-hint text-emce-text-muted">
        Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <p className="mt-6 text-body text-emce-text-sec">
        These Terms of Service (&quot;Terms&quot;) form a binding agreement between you
        and {LEGAL.legalName} (&quot;<strong>{LEGAL.brand}</strong>&quot;, &quot;we&quot;,
        &quot;us&quot;), governing your use of {LEGAL.domain} and any related products
        or services (the &quot;Platform&quot;). By creating an account, posting content,
        applying to a job, or otherwise using the Platform, you agree to these Terms.
        If you do not agree, do not use the Platform.
      </p>

      <Section title="1. Eligibility">
        <p>
          You must be at least 18 years old (or the age of majority in your
          jurisdiction) and legally capable of entering into a binding contract under
          the Indian Contract Act, 1872. If you use the Platform on behalf of an
          organisation, you represent that you are authorised to bind that
          organisation to these Terms.
        </p>
      </Section>

      <Section title="2. Accounts">
        <p>
          You are responsible for the accuracy of information you provide, for
          maintaining the confidentiality of your password, and for all activity
          under your account. Notify us at{" "}
          <a href={`mailto:${LEGAL.emails.support}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.support}
          </a>{" "}
          immediately if you suspect unauthorised access. We may suspend or
          terminate accounts that violate these Terms or pose a risk to the
          Platform.
        </p>
      </Section>

      <Section title="3. The Platform — what we offer">
        <p>
          {LEGAL.brand} is a hiring platform connecting candidates and employers in
          the electric-vehicle industry. Candidates can publish profiles, apply to
          jobs, and message employers. Employers can post jobs, search candidates,
          run an applicant-tracking workflow, and (if enabled) book mentor sessions.
          We are an &quot;intermediary&quot; under the Information Technology Act,
          2000 — we do not author the user-generated content posted on the Platform.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Misrepresent your identity, qualifications, employment history, or affiliations.</li>
          <li>Post content that is unlawful, defamatory, obscene, hateful, harassing, infringing, or which violates a third party&apos;s rights.</li>
          <li>Scrape, crawl, or harvest data from the Platform except via the published API and within rate limits.</li>
          <li>Reverse-engineer, decompile, or attempt to extract source code.</li>
          <li>Use the Platform to send spam, run pyramid schemes, or solicit in bulk outside the messaging features intended for that purpose.</li>
          <li>Interfere with security features, rate limits, or other technical safeguards.</li>
          <li>Upload viruses or malicious code.</li>
          <li>Use automated tools to create accounts, generate fake activity, or simulate engagement.</li>
        </ul>
      </Section>

      <Section title="5. User-generated content">
        <p>
          You retain ownership of content you upload (résumés, profiles, posts,
          messages, recommendations). By posting it on the Platform you grant
          {" "}{LEGAL.brand} a non-exclusive, worldwide, royalty-free licence to
          host, store, reproduce, display, and distribute that content as needed
          to operate the service — for example, showing your public profile to
          recruiters, indexing it for search, and displaying excerpts in
          notifications. This licence ends when you delete the content, except
          to the extent the content has been shared with third parties (e.g. an
          application sent to an employer).
        </p>
        <p>
          You are solely responsible for the content you post and you warrant that
          it is accurate, lawful, and yours to share. We reserve the right (but
          assume no obligation) to remove content that violates these Terms.
        </p>
      </Section>

      <Section title="6. Job postings and applications">
        <p>
          Employers must post genuine, currently-open vacancies and provide
          accurate compensation, location, and skill-requirement details. We do
          not guarantee the accuracy or timeliness of any job listing — apply at
          your own discretion. Applications are routed to the posting employer;
          {" "}{LEGAL.brand} is not the employer of record and does not guarantee
          interviews, offers, or hiring outcomes.
        </p>
      </Section>

      <Section title="7. AI features">
        <p>
          We use machine learning to parse résumés, suggest skills, match
          candidates to jobs, and assist with job-description writing. AI output
          is a best-effort signal — it may be inaccurate or biased — and you
          should review it before relying on it for hiring decisions. We do not
          permit our AI sub-processors to train models on your data.
        </p>
      </Section>

      <Section title="8. Payments, refunds, and cancellations">
        <p>
          Paid features (mentor sessions, featured listings, premium employer
          plans) are billed via our payment processor, Razorpay. Prices are
          shown in INR (₹) and are inclusive of applicable GST unless stated
          otherwise. By purchasing you authorise the charge and confirm the
          card / UPI / netbanking details belong to you.
        </p>
        <p>
          <strong>Refund policy:</strong>
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong>Mentor sessions</strong> — eligible for a full refund if
            cancelled at least 24 hours before the scheduled time, or if the
            mentor does not attend. Cancellations under 24 hours forfeit the fee.
            Disputed sessions are reviewed case-by-case; contact{" "}
            <a href={`mailto:${LEGAL.emails.support}`} className="font-bold text-emce-dark hover:underline">
              {LEGAL.emails.support}
            </a>
            .
          </li>
          <li>
            <strong>Featured job listings &amp; employer plans</strong> — refundable
            on a pro-rata basis within 7 days of purchase if no leads have been
            received. After 7 days, fees are non-refundable. Recurring plans can
            be cancelled at any time and stop renewing at the end of the current
            billing period.
          </li>
          <li>
            <strong>Erroneous or duplicate charges</strong> — fully refunded.
          </li>
        </ul>
        <p>
          Refunds are returned to the original payment method within 5–10
          business days. To request a refund, email{" "}
          <a href={`mailto:${LEGAL.emails.support}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.support}
          </a>{" "}
          with the order ID.
        </p>
      </Section>

      <Section title="9. Verification badges">
        <p>
          DIYguru verification, Verified Company badges, and KYC approvals are
          attestations based on the information available to us at the time of
          verification. They do not constitute an endorsement, warranty, or
          guarantee of the verified party&apos;s competence, performance, or
          conduct. We may revoke a badge at any time if we discover the
          underlying claim is incorrect.
        </p>
      </Section>

      <Section title="10. Intellectual property">
        <p>
          The Platform — its software, design, trademarks, logos, and original
          content — is owned by {LEGAL.legalName} and protected under Indian and
          international copyright, trademark, and trade-secret laws. You receive
          a personal, non-exclusive, non-transferable licence to access and use
          the Platform per these Terms. No other rights are granted.
        </p>
      </Section>

      <Section title="11. Third-party links and integrations">
        <p>
          The Platform may link to third-party websites or integrate with
          third-party services (Google Calendar, Razorpay, LinkedIn, etc.).
          We are not responsible for the content, policies, or practices of
          those third parties. Your use of them is governed by their own terms.
        </p>
      </Section>

      <Section title="12. Disclaimers">
        <p>
          To the maximum extent permitted by law, the Platform is provided
          &quot;as is&quot; and &quot;as available&quot; without warranties of any
          kind, express or implied, including merchantability, fitness for a
          particular purpose, accuracy, or non-infringement. We do not warrant
          that the Platform will be uninterrupted, error-free, secure, or that
          any information obtained through it is accurate or reliable.
        </p>
      </Section>

      <Section title="13. Limitation of liability">
        <p>
          To the maximum extent permitted by law, {LEGAL.brand}, its directors,
          employees, and contractors will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for loss
          of profits, revenue, data, goodwill, or business opportunities,
          arising out of or related to your use of the Platform, even if we
          were advised of the possibility of such damages. Our total aggregate
          liability for any claim arising from these Terms or the Platform is
          limited to the amount you paid us in the 12 months preceding the
          event giving rise to the claim, or ₹10,000 — whichever is greater.
        </p>
      </Section>

      <Section title="14. Indemnity">
        <p>
          You agree to indemnify and hold harmless {LEGAL.brand} from any claim,
          loss, damage, liability, or expense (including reasonable legal fees)
          arising from your breach of these Terms, your content, or your misuse
          of the Platform.
        </p>
      </Section>

      <Section title="15. Termination">
        <p>
          You may close your account at any time from /me/profile. We may
          suspend or terminate your access to the Platform if you breach these
          Terms, if we are required to do so by law, or if continuing to provide
          the service is no longer commercially feasible. Sections 5 (licence
          grant for already-shared content), 8 (payments), 10 (IP), 12–14
          (disclaimers, liability, indemnity), and 17 (governing law) survive
          termination.
        </p>
      </Section>

      <Section title="16. Changes to these Terms">
        <p>
          We may update these Terms from time to time. The &quot;Last updated&quot;
          date at the top will reflect the revision; material changes will be
          notified by email and/or a prominent notice on the Platform.
          Continued use after a change constitutes acceptance.
        </p>
      </Section>

      <Section title="17. Governing law and jurisdiction">
        <p>
          These Terms are governed by the laws of India. Any dispute arising out
          of or in connection with these Terms or the Platform is subject to the
          exclusive jurisdiction of the courts at {LEGAL.registeredOffice.city},
          {" "}{LEGAL.registeredOffice.state}, India. Before filing suit, the
          parties will attempt to resolve the dispute in good faith via the
          Grievance Officer&apos;s mediation; see our{" "}
          <Link href="/privacy" className="font-bold text-emce-dark hover:underline">
            Privacy Policy
          </Link>
          {" "}for those details.
        </p>
      </Section>

      <Section title="18. Contact">
        <p>
          Questions about these Terms? Write to{" "}
          <a href={`mailto:${LEGAL.emails.support}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.support}
          </a>{" "}
          or {LEGAL.legalName}, {formatAddress(LEGAL.registeredOffice)}.
        </p>
      </Section>

      <p className="mt-10 text-hint text-emce-text-muted">
        See also our{" "}
        <Link href="/privacy" className="font-bold text-emce-dark hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/contact" className="font-bold text-emce-dark hover:underline">
          Contact
        </Link>{" "}
        page.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold text-emce-text">{title}</h2>
      <div className="mt-3 space-y-3 text-body text-emce-text-sec">{children}</div>
    </section>
  );
}
