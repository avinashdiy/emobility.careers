import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, Clock, MessageCircle } from "lucide-react";
import { LEGAL, formatAddress } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get in touch with ${LEGAL.brand} — support, partnerships, press, and grievances.`,
};

export default function ContactPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">Contact</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Talk to us
      </h1>
      <p className="mt-3 text-emce-text-sec">
        We staff a real human inbox during business hours. For account or
        application questions please use the support email — it routes to
        the team that can act fastest. For press, partnerships, or
        investor enquiries use the business address.
      </p>

      {/* Primary contact channels */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emce-mid" />
            <h3 className="text-section text-emce-text">Support</h3>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            Account, applications, profile, billing.
          </p>
          <a
            href={`mailto:${LEGAL.emails.support}`}
            className="mt-3 inline-block font-bold text-emce-dark hover:underline"
          >
            {LEGAL.emails.support}
          </a>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emce-mid" />
            <h3 className="text-section text-emce-text">Business</h3>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            Partnerships, press, investor enquiries.
          </p>
          <a
            href={`mailto:${LEGAL.emails.business}`}
            className="mt-3 inline-block font-bold text-emce-dark hover:underline"
          >
            {LEGAL.emails.business}
          </a>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-emce-mid" />
            <h3 className="text-section text-emce-text">Phone</h3>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            Staffed during business hours.
          </p>
          <a
            href={`tel:${LEGAL.phones.support.replace(/\s|-/g, "")}`}
            className="mt-3 inline-block font-bold text-emce-dark hover:underline"
          >
            {LEGAL.phones.supportDisplay}
          </a>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-emce-mid" />
            <h3 className="text-section text-emce-text">WhatsApp</h3>
          </div>
          <p className="mt-1 text-hint text-emce-text-sec">
            Quick questions and digest opt-in.
          </p>
          <a
            href={`https://wa.me/${LEGAL.whatsapp.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-bold text-emce-dark hover:underline"
          >
            Chat on WhatsApp →
          </a>
        </Card>
      </div>

      {/* Address + hours */}
      <Card className="mt-4 p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emce-mid" />
              <h3 className="text-section text-emce-text">Registered office</h3>
            </div>
            <p className="mt-2 whitespace-pre-line text-body text-emce-text-sec">
              {LEGAL.legalName}
              {"\n"}
              {formatAddress(LEGAL.registeredOffice)}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-emce-mid" />
              <h3 className="text-section text-emce-text">Business hours</h3>
            </div>
            <p className="mt-2 text-body text-emce-text-sec">{LEGAL.hours}</p>
            <p className="mt-1 text-hint text-emce-text-muted">
              Email replies typically within one business day.
            </p>
          </div>
        </div>
      </Card>

      {/* Grievance officer — required by India's IT Rules 2021 + DPDP Act 2023 */}
      <h2 className="mt-10 text-xl font-extrabold text-emce-text">Grievance officer</h2>
      <p className="mt-2 text-body text-emce-text-sec">
        Per the Information Technology (Intermediary Guidelines and Digital
        Media Ethics Code) Rules, 2021, and the Digital Personal Data
        Protection Act, 2023, you can reach our grievance officer for any
        complaint relating to content, account, or your personal data:
      </p>
      <Card className="mt-3 p-6">
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
        </dl>
        <p className="mt-3 text-hint text-emce-text-muted">
          We acknowledge complaints within 24 hours and resolve them
          within 15 days, as required by the IT Rules.
        </p>
      </Card>

      {/* Quick links */}
      <h2 className="mt-10 text-xl font-extrabold text-emce-text">Other ways to reach us</h2>
      <ul className="mt-3 space-y-2 text-body text-emce-text-sec">
        <li>
          Privacy questions:{" "}
          <a
            href={`mailto:${LEGAL.emails.privacy}`}
            className="font-bold text-emce-dark hover:underline"
          >
            {LEGAL.emails.privacy}
          </a>{" "}
          — see our{" "}
          <Link href="/privacy" className="font-bold text-emce-dark hover:underline">
            Privacy Policy
          </Link>
          .
        </li>
        <li>
          LinkedIn:{" "}
          <a
            href={LEGAL.social.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-emce-dark hover:underline"
          >
            {LEGAL.social.linkedin.replace("https://www.", "")}
          </a>
        </li>
        <li>
          Twitter:{" "}
          <a
            href={LEGAL.social.twitter}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-emce-dark hover:underline"
          >
            {LEGAL.social.twitter.replace("https://", "")}
          </a>
        </li>
      </ul>
    </div>
  );
}
