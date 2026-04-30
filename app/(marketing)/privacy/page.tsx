import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEGAL, formatAddress, LEGAL_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${LEGAL.brand} collects, uses, and protects your personal data.`,
};

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">Legal</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Privacy Policy
      </h1>
      <p className="mt-2 text-hint text-emce-text-muted">
        Last updated: {LEGAL_LAST_UPDATED}
      </p>

      <p className="mt-6 text-body text-emce-text-sec">
        This Privacy Policy describes how {LEGAL.legalName} (&quot;
        <strong>{LEGAL.brand}</strong>&quot;, &quot;we&quot;, &quot;us&quot;, or
        &quot;our&quot;) collects, uses, shares, and protects personal data when you visit
        or use {LEGAL.domain} and any related products or services (the
        &quot;Platform&quot;). By using the Platform you agree to this Policy.
        It is published in compliance with the Information Technology Act, 2000, the
        Digital Personal Data Protection Act, 2023 (&quot;DPDP Act&quot;), the IT
        (Reasonable Security Practices and Procedures and Sensitive Personal Data or
        Information) Rules, 2011, and the IT (Intermediary Guidelines and Digital Media
        Ethics Code) Rules, 2021.
      </p>

      <Section title="1. Who we are">
        <p>
          {LEGAL.legalName} ({LEGAL.legalEntityType}, CIN/LLPIN{" "}
          <span className="font-mono text-xs">{LEGAL.cin}</span>) operates the
          Platform from its registered office at {formatAddress(LEGAL.registeredOffice)}.
          For any privacy-related question, contact{" "}
          <a href={`mailto:${LEGAL.emails.privacy}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.privacy}
          </a>{" "}
          or our Grievance Officer (details at the end of this page).
        </p>
      </Section>

      <Section title="2. Information we collect">
        <p>We collect the following categories of data:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong>Account information</strong> — name, email, password (hashed),
            phone, role (candidate / employer / admin), preferred locale, profile photo
            URL. Provided by you at signup, or imported from a third-party identity
            provider (Google or LinkedIn) if you choose social sign-in.
          </li>
          <li>
            <strong>Profile content</strong> — résumé, work experience, education,
            certifications, skills, awards, projects, languages spoken, salary
            expectations, location, social links, custom CTA, and any other content
            you publish to your public profile.
          </li>
          <li>
            <strong>Recruitment activity</strong> — applications submitted, jobs saved,
            messages exchanged with employers, interview slots, mentorship bookings,
            recommendations given and received, peer skill endorsements.
          </li>
          <li>
            <strong>Verification data</strong> — DIYguru student ID (where applicable),
            email-domain proof for employer verification, KYC documents uploaded by
            employers for company approval.
          </li>
          <li>
            <strong>Payment data</strong> — for paid features (mentor sessions,
            featured listings, premium employer plans), our payment processor
            (Razorpay) collects card or UPI details directly. We never store full
            card numbers; we receive a tokenised reference and the success/failure
            status of each transaction along with masked metadata (last four digits,
            card brand) for receipts and refunds.
          </li>
          <li>
            <strong>Technical data</strong> — IP address, user-agent string, device
            type, referral source, pages visited, click events, error logs, and
            session identifiers. Used to operate, secure, and improve the Platform.
          </li>
          <li>
            <strong>Cookies &amp; similar technologies</strong> — see the &quot;Cookies&quot;
            section below.
          </li>
        </ul>
        <p className="mt-3">
          We do <strong>not</strong> knowingly collect data from children under 18.
          The Platform is intended for adult professionals and students preparing for
          the workforce; if we learn we&apos;ve collected a minor&apos;s data without
          verifiable parental consent, we delete it.
        </p>
      </Section>

      <Section title="3. How we use your data">
        <p>We process your personal data only for these purposes:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>To create and operate your account, authenticate you, and keep the service available.</li>
          <li>To match candidates with relevant jobs and employers with relevant candidates.</li>
          <li>To deliver messages, notifications, and email/SMS digests you have opted in to.</li>
          <li>To process payments, invoice you, and provide receipts and refunds.</li>
          <li>To prevent fraud, abuse, spam, scraping, and credential stuffing.</li>
          <li>To comply with legal obligations (tax, court orders, lawful government requests).</li>
          <li>To improve the Platform — anonymous, aggregated analytics on feature usage.</li>
        </ul>
      </Section>

      <Section title="4. Lawful basis for processing">
        <p>
          We rely on the following lawful bases under the DPDP Act and applicable
          laws: your consent (for marketing communications and optional profile
          fields), performance of a contract (to deliver the service you signed up
          for), our legitimate interests (security, fraud prevention, product
          improvement), and legal obligations (e.g. responding to tax or law
          enforcement requests).
        </p>
      </Section>

      <Section title="5. How we share your data">
        <p>We share data only in the following situations:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <strong>With employers you apply to</strong> — your profile, résumé,
            cover letter, and answers to job-specific questions are visible to the
            posting employer&apos;s recruiting team. You control discoverability via
            the privacy controls in your profile.
          </li>
          <li>
            <strong>With other candidates and the public</strong> — when your
            profile visibility is set to &quot;Everyone&quot;, your profile is
            publicly indexable. Set it to &quot;Recruiters only&quot; or
            &quot;Private&quot; in /me/profile to restrict it.
          </li>
          <li>
            <strong>With service providers (sub-processors)</strong> we engage to run
            the Platform. They are bound by contract to use data only as instructed:
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Hosting &amp; storage — our cloud infrastructure provider.</li>
              <li>Email — Resend (transactional emails).</li>
              <li>SMS &amp; WhatsApp — MSG91.</li>
              <li>Payments — Razorpay.</li>
              <li>Analytics &amp; error reporting — privacy-friendly tooling for product analytics and crash reports.</li>
              <li>AI features — OpenAI for résumé parsing, JD assistance, and matching reasoning. We do not allow these providers to train models on your data.</li>
            </ul>
          </li>
          <li>
            <strong>For legal reasons</strong> — when required by law, court order,
            or to protect rights, safety, or property.
          </li>
          <li>
            <strong>In a business transfer</strong> — if {LEGAL.brand} is acquired or
            merged, your data may be transferred to the successor under the same
            terms as this Policy.
          </li>
        </ul>
        <p className="mt-3">
          We do <strong>not</strong> sell your personal data to advertisers or data
          brokers.
        </p>
      </Section>

      <Section title="6. International transfers">
        <p>
          Some of our sub-processors (notably OpenAI, Resend) are located outside
          India. When we transfer data internationally, we rely on the protections
          permitted under the DPDP Act and contractually require equivalent
          safeguards from those providers. Personal data of users located in the
          European Economic Area is processed under the GDPR&apos;s standard
          contractual clauses.
        </p>
      </Section>

      <Section title="7. How long we keep data">
        <p>We retain personal data only as long as needed for the purposes above:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Account and profile data — until you delete your account.</li>
          <li>Application history — for 24 months after the application closes, then anonymised for analytics.</li>
          <li>Messages — for 36 months for dispute resolution; you can delete individual threads at any time.</li>
          <li>Payment records — for 8 years to comply with the Income Tax Act.</li>
          <li>Server logs — for 90 days, then aggregated.</li>
        </ul>
        <p className="mt-3">
          When you delete your account, we erase or anonymise all data tied to
          you within 30 days, except records we are legally required to keep.
        </p>
      </Section>

      <Section title="8. Your rights">
        <p>Subject to verification of identity, you have the right to:</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li><strong>Access</strong> a copy of the personal data we hold about you.</li>
          <li><strong>Correct</strong> inaccurate or incomplete data — most fields are editable from /me/profile.</li>
          <li><strong>Delete</strong> your account and the associated data.</li>
          <li><strong>Withdraw consent</strong> for marketing or optional processing.</li>
          <li><strong>Restrict or object</strong> to certain processing.</li>
          <li><strong>Port</strong> your data — receive an export in a machine-readable format.</li>
          <li><strong>Nominate</strong> another individual to exercise these rights on your behalf in case of incapacity (DPDP Act, Section 14).</li>
          <li><strong>Lodge a complaint</strong> with the Data Protection Board of India.</li>
        </ul>
        <p className="mt-3">
          To exercise any of these, write to{" "}
          <a href={`mailto:${LEGAL.emails.privacy}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.privacy}
          </a>
          . We respond within 30 days.
        </p>
      </Section>

      <Section title="9. Security">
        <p>
          We follow industry-standard practices: TLS 1.2+ in transit; passwords
          hashed with bcrypt; encrypted backups; least-privilege access controls;
          rate limiting and bot mitigation; regular dependency audits; logged and
          monitored privileged actions. No system is perfectly secure — if you
          suspect your account has been compromised, contact{" "}
          <a href={`mailto:${LEGAL.emails.support}`} className="font-bold text-emce-dark hover:underline">
            {LEGAL.emails.support}
          </a>{" "}
          immediately.
        </p>
      </Section>

      <Section title="10. Cookies">
        <p>
          We use strictly-necessary cookies for authentication, CSRF protection,
          and locale preference. Optional analytics cookies record pseudonymous
          page-view metrics; these can be declined via your browser&apos;s
          do-not-track setting. We do not use third-party advertising cookies.
        </p>
      </Section>

      <Section title="11. Changes to this Policy">
        <p>
          We may update this Policy when we add features, change sub-processors, or
          when the law changes. The &quot;Last updated&quot; date at the top will
          reflect the revision; substantial changes are emailed to registered
          users. Continued use of the Platform after a change constitutes
          acceptance.
        </p>
      </Section>

      <Section title="12. Grievance Officer (DPDP Act 2023, IT Rules 2021)">
        <Card className="p-5">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-bold text-emce-text">Name</dt>
              <dd className="text-emce-text-sec">{LEGAL.grievanceOfficer.name}</dd>
            </div>
            <div>
              <dt className="font-bold text-emce-text">Designation</dt>
              <dd className="text-emce-text-sec">{LEGAL.grievanceOfficer.title}</dd>
            </div>
            <div>
              <dt className="font-bold text-emce-text">Email</dt>
              <dd>
                <a
                  href={`mailto:${LEGAL.grievanceOfficer.email}`}
                  className="font-bold text-emce-dark hover:underline"
                >
                  {LEGAL.grievanceOfficer.email}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-bold text-emce-text">Phone</dt>
              <dd className="text-emce-text-sec">{LEGAL.grievanceOfficer.phone}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-bold text-emce-text">Postal address</dt>
              <dd className="text-emce-text-sec">
                {LEGAL.legalName}, {formatAddress(LEGAL.registeredOffice)}
              </dd>
            </div>
          </dl>
        </Card>
        <p className="mt-3 text-hint text-emce-text-muted">
          We acknowledge complaints within 24 hours and resolve them within 15 days,
          as required by the IT Rules.
        </p>
      </Section>

      <p className="mt-10 text-hint text-emce-text-muted">
        See also our{" "}
        <Link href="/terms" className="font-bold text-emce-dark hover:underline">
          Terms of Service
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
