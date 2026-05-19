import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LEGAL, formatAddress } from "@/lib/legal";

export const metadata: Metadata = {
  title: "About",
  // Bing flagged the previous 82-char description as too short. The
  // 150+ char version below adds the EV-domain breadcrumbs that
  // matter to crawlers indexing this page for "who is X" queries.
  description: `${LEGAL.brand} — India's specialised hiring platform for the EV industry. Battery, charging, powertrain, and motor-engineering roles for technicians and engineers.`,
};

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-12">
      <Badge variant="default">About</Badge>
      <h1 className="mt-3 text-2xl font-extrabold text-emce-text md:text-3xl">
        Built for the EV industry, by people in it.
      </h1>
      <p className="mt-3 text-emce-text-sec">
        {LEGAL.brand} is a specialised hiring platform for India&apos;s electric-vehicle
        industry. We connect technicians and engineers across battery, charging, powertrain,
        motors, and vehicle engineering with the country&apos;s fastest-growing EV companies —
        from startups to OEMs to charging operators.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-section text-emce-text">Why we exist</h3>
          <p className="mt-2 text-body text-emce-text-sec">
            Generic job boards don&apos;t understand EV. We curate the talent network around
            domain-specific skills, lab exposure, and verified certifications so hiring is
            faster and signal-rich.
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="text-section text-emce-text">Powered by DIYguru</h3>
          <p className="mt-2 text-body text-emce-text-sec">
            DIYguru-trained graduates carry a verified badge, with their lab tags, capstone
            projects, and certifications surfaced to employers as a trust signal.
          </p>
        </Card>
      </div>

      <h2 className="mt-10 text-xl font-extrabold text-emce-text">What we do</h2>
      <ul className="mt-3 space-y-2 text-body text-emce-text-sec">
        <li>
          <strong className="text-emce-text">Discoverable profiles</strong> — engineers and
          technicians build a public profile that surfaces EV-specific skills, projects, and
          certifications instead of generic résumé bullets.
        </li>
        <li>
          <strong className="text-emce-text">Curated job board</strong> — only EV-industry
          roles, posted by verified employers, filterable by domain (battery / charging /
          powertrain / motor control / software / manufacturing).
        </li>
        <li>
          <strong className="text-emce-text">AI-assisted matching</strong> — résumé parser
          extracts EV-specific competencies; the matching engine ranks candidates by domain
          fit, skill overlap, and lab exposure.
        </li>
        <li>
          <strong className="text-emce-text">DIYguru verification</strong> — graduates from
          the DIYguru curriculum carry a verified badge with their lab tags surfaced
          automatically.
        </li>
        <li>
          <strong className="text-emce-text">Pulse + Salaries</strong> — daily EV-industry
          news pulse and a verified salary database (Levels.fyi-style for India EV).
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-extrabold text-emce-text">Company information</h2>
      <Card className="mt-3 p-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold text-emce-text">Legal entity</dt>
            <dd className="text-emce-text-sec">{LEGAL.legalName}</dd>
          </div>
          <div>
            <dt className="font-bold text-emce-text">Entity type</dt>
            <dd className="text-emce-text-sec">{LEGAL.legalEntityType}</dd>
          </div>
          <div>
            <dt className="font-bold text-emce-text">CIN</dt>
            <dd className="font-mono text-xs text-emce-text-sec">{LEGAL.cin}</dd>
          </div>
          {LEGAL.gstin && (
            <div>
              <dt className="font-bold text-emce-text">GSTIN</dt>
              <dd className="font-mono text-xs text-emce-text-sec">{LEGAL.gstin}</dd>
            </div>
          )}
          {LEGAL.dipp && (
            <div>
              <dt className="font-bold text-emce-text">Startup India</dt>
              <dd className="font-mono text-xs text-emce-text-sec">{LEGAL.dipp}</dd>
            </div>
          )}
          <div>
            <dt className="font-bold text-emce-text">Founded</dt>
            <dd className="text-emce-text-sec">{LEGAL.foundedYear}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-bold text-emce-text">Registered office</dt>
            <dd className="text-emce-text-sec">{formatAddress(LEGAL.registeredOffice)}</dd>
          </div>
        </dl>
      </Card>

      <h2 className="mt-10 text-xl font-extrabold text-emce-text">Founders</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {LEGAL.founders.map((f) => (
          <Card key={f.name} className="p-4">
            <p className="font-bold text-emce-text">{f.name}</p>
            <p className="text-hint text-emce-text-sec">{f.role}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Button asChild variant="default">
          <Link href="/jobs">Browse jobs</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/contact">Contact us</Link>
        </Button>
      </div>
    </div>
  );
}
