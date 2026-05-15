"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  runResumeBuilder,
  type ResumeBuilderState,
} from "@/server/ai-tools/resume-builder-actions";
import type { BuiltResume } from "@/lib/ai/resume-builder";

interface DomainOption {
  slug: string;
  name: string;
}

interface Props {
  evDomains: DomainOption[];
}

export function ResumeBuilderForm({ evDomains }: Props) {
  const [state, formAction] = useActionState<ResumeBuilderState, FormData>(
    runResumeBuilder,
    { ok: false },
  );
  const v = state.prevValues ?? {};

  return (
    <>
      <Card className="p-6 print:hidden">
        <h2 className="text-section text-emce-text">Tell us about you</h2>
        <p className="mt-1 text-hint text-emce-text-sec">
          Fill in the basics, paste a brain-dump of your past roles + skills +
          projects (any order). The AI restructures it into a clean, ATS-
          friendly resume you can print or save as PDF.
        </p>

        {state.message && !state.ok && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-emce-red/40 bg-emce-red-light p-3 text-sm text-emce-red-deep"
          >
            {state.message}
          </div>
        )}

        <form action={formAction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name" required>Full name</Label>
            <Input id="name" name="name" required minLength={2} maxLength={120} defaultValue={v.name ?? ""} placeholder="e.g. Priya Sharma" />
          </div>
          <div>
            <Label htmlFor="targetRole" required>Target role</Label>
            <Input id="targetRole" name="targetRole" required minLength={2} maxLength={120} defaultValue={v.targetRole ?? ""} placeholder="e.g. Battery Pack Engineer" />
          </div>

          <div>
            <Label htmlFor="email" optional>Email</Label>
            <Input id="email" name="email" type="email" maxLength={120} defaultValue={v.email ?? ""} placeholder="you@example.com" />
          </div>
          <div>
            <Label htmlFor="phone" optional>Phone</Label>
            <Input id="phone" name="phone" type="tel" maxLength={40} defaultValue={v.phone ?? ""} placeholder="+91 98xxx xxxxx" />
          </div>

          <div>
            <Label htmlFor="location" optional>Location</Label>
            <Input id="location" name="location" maxLength={120} defaultValue={v.location ?? ""} placeholder="e.g. Bengaluru, India" />
          </div>
          <div>
            <Label htmlFor="evDomainSlug" optional>EV domain</Label>
            <NativeSelect id="evDomainSlug" name="evDomainSlug" defaultValue={v.evDomainSlug ?? ""}>
              <option value="">— general EV positioning —</option>
              {evDomains.map((d) => (
                <option key={d.slug} value={d.slug}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="linkedinUrl" optional>LinkedIn URL</Label>
            <Input id="linkedinUrl" name="linkedinUrl" type="url" maxLength={300} defaultValue={v.linkedinUrl ?? ""} placeholder="https://linkedin.com/in/…" />
          </div>
          <div>
            <Label htmlFor="portfolioUrl" optional>Portfolio / website</Label>
            <Input id="portfolioUrl" name="portfolioUrl" type="url" maxLength={300} defaultValue={v.portfolioUrl ?? ""} placeholder="https://…" />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="brainDump" required>
              Brain dump — past roles, projects, education, skills (any order)
            </Label>
            <Textarea
              id="brainDump"
              name="brainDump"
              rows={12}
              required
              minLength={80}
              maxLength={8000}
              defaultValue={v.brainDump ?? ""}
              placeholder={`The more specific, the sharper the resume. Drop numbers, named tools, named standards.\n\ne.g.\nWorked at Bosch 2022-2024 as a powertrain test engineer. Mostly FOC algorithm tuning + dyno testing for an inverter project. Did a stint with the AUTOSAR team. M.Tech from VIT 2022 (CGPA 8.6). Comfortable with CAN bus, MATLAB, Simulink, embedded C.\n\nLed the BMS firmware on Formula Student EV in undergrad — 7s4p Li-NMC pack, ISO-26262 awareness, reduced cell-imbalance alerts by 40%.\n\nCertified in AIS-156 (ARAI, 2023).`}
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              Vague input = vague resume. Drop metrics, tool names, and named standards where you can.
            </p>
          </div>

          <div className="sm:col-span-2 flex justify-end border-t border-emce-border pt-4">
            <SubmitButton size="lg" pendingLabel="Building…">
              {state.result ? "Rebuild resume" : "Build my resume →"}
            </SubmitButton>
          </div>
        </form>
      </Card>

      {state.ok && state.result && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-hint text-emce-text-sec">
              Your resume is below. Use <strong>Print → Save as PDF</strong> in
              your browser to export it.
            </p>
            <Button
              type="button"
              onClick={() => window.print()}
            >
              🖨️ Print / Save as PDF
            </Button>
          </div>
          <ResumePreview resume={state.result} />
        </div>
      )}
    </>
  );
}

/**
 * ATS-friendly rendered resume. Plain HTML, no images, no fancy
 * columns, no icons — the kind of layout ATS parsers can index
 * without choking. The `print:` Tailwind variants strip the
 * container chrome when the user prints so the PDF output is just
 * the resume content on a clean page.
 */
function ResumePreview({ resume }: { resume: BuiltResume }) {
  const contactBits = [
    resume.contact.email,
    resume.contact.phone,
    resume.contact.location,
    resume.contact.linkedin,
    resume.contact.portfolio,
  ].filter(Boolean);

  return (
    <div className="resume-preview rounded-lg border border-emce-border bg-white p-8 text-emce-darkest print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <style>{`
        @media print {
          @page { margin: 0.5in; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .resume-preview h1 { font-size: 22pt; }
          .resume-preview h2 { font-size: 12pt; }
          .resume-preview { font-size: 10.5pt; line-height: 1.4; }
        }
      `}</style>
      <header className="border-b border-emce-darkest pb-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-emce-darkest">
          {resume.name}
        </h1>
        <p className="mt-0.5 text-sm font-bold uppercase tracking-wide text-emce-dark">
          {resume.targetRole}
        </p>
        {contactBits.length > 0 && (
          <p className="mt-1 text-xs text-emce-text-sec">
            {contactBits.join(" · ")}
          </p>
        )}
      </header>

      {resume.summary && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Summary
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-emce-text">
            {resume.summary}
          </p>
        </section>
      )}

      {resume.skillsLine && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Skills
          </h2>
          <p className="mt-1 text-sm text-emce-text">{resume.skillsLine}</p>
        </section>
      )}

      {resume.experiences.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Experience
          </h2>
          <ul className="mt-2 space-y-3">
            {resume.experiences.map((e, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <strong className="text-emce-darkest">{e.title}</strong>
                  <span className="text-xs text-emce-text-sec">{e.dates}</span>
                </div>
                <p className="text-sm italic text-emce-text-sec">
                  {[e.company, e.location].filter(Boolean).join(" · ")}
                </p>
                {e.bullets.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-emce-text">
                    {e.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resume.projects.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Projects
          </h2>
          <ul className="mt-2 space-y-2">
            {resume.projects.map((p, i) => (
              <li key={i}>
                <p>
                  <strong className="text-emce-darkest">{p.title}</strong>
                  {p.url && (
                    <>
                      {" · "}
                      <a href={p.url} className="text-emce-dark underline">
                        {p.url}
                      </a>
                    </>
                  )}
                </p>
                {p.description && (
                  <p className="text-sm text-emce-text">{p.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resume.education.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Education
          </h2>
          <ul className="mt-2 space-y-2">
            {resume.education.map((e, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <strong className="text-emce-darkest">{e.degree}</strong>
                  <span className="text-xs text-emce-text-sec">{e.year}</span>
                </div>
                <p className="text-sm italic text-emce-text-sec">{e.institution}</p>
                {e.note && <p className="text-sm text-emce-text">{e.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resume.certifications.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-emce-darkest">
            Certifications
          </h2>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-emce-text">
            {resume.certifications.map((c, i) => (
              <li key={i}>
                <strong>{c.name}</strong>
                {c.issuer && ` · ${c.issuer}`}
                {c.year && ` · ${c.year}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
