"use client";

import { useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createJDTemplate,
  updateJDTemplate,
} from "@/server/admin/jd-template-actions";

/**
 * Single editor form shared by /admin/jd-templates/new and
 * /admin/jd-templates/[id]. All long-form bullet fields are
 * newline-separated textareas — see jd-template-actions.ts:parseLines
 * for the normalisation rule.
 *
 * The component is a client one only so the bullet-helper text and
 * the pending-submit state can update — the actual save is a Server
 * Action (createJDTemplate / updateJDTemplate).
 */

type JDFormState = {
  id?: string;
  slug?: string;
  title: string;
  alternativeTitles: string[];
  summary: string;
  overview: string;
  collarType: string;
  seniority: string;
  functionalArea: string;
  evDomainId: string | null;
  typicalCompanies: string[];
  typicalIndustries: string[];
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  keySkills: string[];
  tools: string[];
  certifications: string[];
  experienceMinYears: number;
  experienceMaxYears: number;
  salaryMinLakhs: number | null;
  salaryMedianLakhs: number | null;
  salaryMaxLakhs: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  salaryRoleQuery: string | null;
  careerPath: string[];
  reportsTo: string | null;
  reports: string[];
  sampleInterviewQuestions: string[];
  demandSignal: string | null;
  remoteFriendly: boolean;
  growthOutlook: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

const COLLAR_OPTIONS = [
  { v: "BLUE", l: "Blue-collar" },
  { v: "GREY", l: "Skilled trade / Grey-collar" },
  { v: "WHITE", l: "White-collar" },
  { v: "CXO", l: "CXO / Executive" },
];

const SENIORITY_OPTIONS = [
  { v: "ENTRY", l: "Entry (0-1 yr)" },
  { v: "JUNIOR", l: "Junior (1-3 yr)" },
  { v: "MID", l: "Mid (3-6 yr)" },
  { v: "SENIOR", l: "Senior (6-10 yr)" },
  { v: "LEAD", l: "Lead / Staff (10-15 yr)" },
  { v: "PRINCIPAL", l: "Principal / Director (15+ yr)" },
  { v: "EXECUTIVE", l: "CXO / Head-of" },
];

const FA_OPTIONS = [
  { v: "ENGINEERING", l: "Engineering" },
  { v: "RESEARCH_AND_DEVELOPMENT", l: "R&D" },
  { v: "SOFTWARE", l: "Software" },
  { v: "DATA_AND_AI", l: "Data & AI" },
  { v: "PRODUCT", l: "Product" },
  { v: "DESIGN", l: "Design" },
  { v: "MANUFACTURING", l: "Manufacturing" },
  { v: "QUALITY", l: "Quality" },
  { v: "SUPPLY_CHAIN", l: "Supply chain" },
  { v: "OPERATIONS", l: "Operations" },
  { v: "SERVICE_AND_AFTERSALES", l: "Service & after-sales" },
  { v: "SALES", l: "Sales" },
  { v: "MARKETING", l: "Marketing" },
  { v: "BUSINESS_DEVELOPMENT", l: "Business development" },
  { v: "HR_AND_RECRUITING", l: "HR & recruiting" },
  { v: "FINANCE", l: "Finance" },
  { v: "LEGAL_AND_COMPLIANCE", l: "Legal & compliance" },
  { v: "STRATEGY", l: "Strategy" },
  { v: "EXECUTIVE", l: "Executive" },
];

export function JDTemplateEditor({
  initial,
  evDomains,
  mode,
}: {
  initial: JDFormState;
  evDomains: { id: string; name: string }[];
  mode: "create" | "edit";
}) {
  const [pending, startTransition] = useTransition();

  const action = mode === "create" ? createJDTemplate : updateJDTemplate;

  return (
    <form
      action={(fd) => startTransition(() => action(fd))}
      className="space-y-6"
    >
      {mode === "edit" && initial.id && (
        <input type="hidden" name="id" value={initial.id} />
      )}

      <Card className="p-5">
        <h2 className="text-section text-emce-text">Headline</h2>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              name="title"
              defaultValue={initial.title}
              placeholder="e.g. Battery Cell Engineer"
              required
              maxLength={160}
            />
            {mode === "edit" && initial.slug && (
              <p className="mt-1 text-hint text-emce-text-muted">
                URL: /jd/{initial.slug}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="alternativeTitles">Alternative titles (one per line)</Label>
            <Textarea
              id="alternativeTitles"
              name="alternativeTitles"
              defaultValue={initial.alternativeTitles.join("\n")}
              rows={3}
              placeholder={"Lithium-ion Cell Engineer\nCell Design Engineer\nBattery Cell Scientist"}
            />
          </div>
          <div>
            <Label htmlFor="summary">One-line summary (≤280 chars) *</Label>
            <Textarea
              id="summary"
              name="summary"
              defaultValue={initial.summary}
              rows={2}
              required
              maxLength={280}
              placeholder="Owns cell-level R&D for lithium-ion chemistry — from electrode design through prototype validation."
            />
          </div>
          <div>
            <Label htmlFor="overview">Overview (long form) *</Label>
            <Textarea
              id="overview"
              name="overview"
              defaultValue={initial.overview}
              rows={6}
              required
              maxLength={8000}
              placeholder="A few paragraphs about what the role does, who they work with, and the typical company stage. Markdown allowed."
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-section text-emce-text">Classification</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="collarType">Collar type *</Label>
            <NativeSelect id="collarType" name="collarType" defaultValue={initial.collarType}>
              {COLLAR_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="seniority">Seniority *</Label>
            <NativeSelect id="seniority" name="seniority" defaultValue={initial.seniority}>
              {SENIORITY_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="functionalArea">Functional area *</Label>
            <NativeSelect id="functionalArea" name="functionalArea" defaultValue={initial.functionalArea}>
              {FA_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="evDomainId">EV domain</Label>
            <NativeSelect
              id="evDomainId"
              name="evDomainId"
              defaultValue={initial.evDomainId ?? ""}
            >
              <option value="">— None —</option>
              {evDomains.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <Label htmlFor="reportsTo">Reports to</Label>
            <Input
              id="reportsTo"
              name="reportsTo"
              defaultValue={initial.reportsTo ?? ""}
              placeholder="e.g. Battery Systems Manager"
              maxLength={120}
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex items-center gap-2 text-sm font-bold text-emce-text">
              <input
                type="checkbox"
                name="remoteFriendly"
                defaultChecked={initial.remoteFriendly}
                className="h-4 w-4"
              />
              Remote-friendly
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-section text-emce-text">Salary band (India default)</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Label htmlFor="experienceMinYears">Min experience (yrs)</Label>
            <Input
              id="experienceMinYears"
              name="experienceMinYears"
              type="number"
              min={0}
              max={40}
              defaultValue={initial.experienceMinYears}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="experienceMaxYears">Max experience (yrs)</Label>
            <Input
              id="experienceMaxYears"
              name="experienceMaxYears"
              type="number"
              min={0}
              max={40}
              defaultValue={initial.experienceMaxYears}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="salaryPeriod">Period</Label>
            <NativeSelect
              id="salaryPeriod"
              name="salaryPeriod"
              defaultValue={initial.salaryPeriod}
            >
              <option value="YEARLY">Yearly</option>
              <option value="MONTHLY">Monthly</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="salaryMinLakhs">Min (₹ lakhs)</Label>
            <Input
              id="salaryMinLakhs"
              name="salaryMinLakhs"
              type="number"
              step="0.1"
              min={0}
              defaultValue={initial.salaryMinLakhs ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="salaryMedianLakhs">Median (₹ lakhs)</Label>
            <Input
              id="salaryMedianLakhs"
              name="salaryMedianLakhs"
              type="number"
              step="0.1"
              min={0}
              defaultValue={initial.salaryMedianLakhs ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="salaryMaxLakhs">Max (₹ lakhs)</Label>
            <Input
              id="salaryMaxLakhs"
              name="salaryMaxLakhs"
              type="number"
              step="0.1"
              min={0}
              defaultValue={initial.salaryMaxLakhs ?? ""}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="salaryCurrency">Currency</Label>
            <Input
              id="salaryCurrency"
              name="salaryCurrency"
              defaultValue={initial.salaryCurrency}
              maxLength={3}
              placeholder="INR"
            />
          </div>
          <div className="sm:col-span-4">
            <Label htmlFor="salaryRoleQuery">SalarySubmission LIKE pattern (optional)</Label>
            <Input
              id="salaryRoleQuery"
              name="salaryRoleQuery"
              defaultValue={initial.salaryRoleQuery ?? ""}
              placeholder="%Battery%Engineer%"
              maxLength={280}
            />
            <p className="mt-1 text-hint text-emce-text-muted">
              When set, the live salary band on /jd/{`{slug}`} is computed from approved
              SalarySubmission rows whose jobTitle matches this pattern.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-section text-emce-text">Demand & growth</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="demandSignal">Demand signal</Label>
            <Input
              id="demandSignal"
              name="demandSignal"
              defaultValue={initial.demandSignal ?? ""}
              placeholder="High | Critical | Emerging | Steady"
              maxLength={40}
            />
          </div>
          <div>
            <Label htmlFor="growthOutlook">Growth outlook</Label>
            <Input
              id="growthOutlook"
              name="growthOutlook"
              defaultValue={initial.growthOutlook ?? ""}
              placeholder="e.g. +45% YoY hiring in India FY24-25"
              maxLength={280}
            />
          </div>
        </div>
      </Card>

      <BulletField
        id="responsibilities"
        label="Responsibilities (first 3 are public; rest gated)"
        value={initial.responsibilities}
        placeholder={"Design cell electrode chemistries…\nRun coin-cell validation cycles…\nPartner with manufacturing to scale prototype to pilot line…"}
      />

      <BulletField
        id="requirements"
        label="Requirements (first 3 public)"
        value={initial.requirements}
        placeholder={"BE / BTech in Chemical or Electrochemical Engineering…\n4+ years in Li-ion R&D…\nHands-on experience with coin-cell + pouch-cell assembly…"}
      />

      <BulletField
        id="preferredQualifications"
        label="Preferred qualifications (gated)"
        value={initial.preferredQualifications}
        placeholder={"PhD in Battery Materials…\nPublished research in Joule / Nature Energy…"}
      />

      <BulletField
        id="keySkills"
        label="Key skills (fully public — drives SEO)"
        value={initial.keySkills}
        placeholder={"BMS\nLithium-ion chemistry\nElectrode design\nCell formation\n…"}
      />

      <BulletField
        id="tools"
        label="Tools & software (public)"
        value={initial.tools}
        placeholder={"COMSOL\nMATLAB\nAVL CRUISE\nAltium Designer\n…"}
      />

      <BulletField
        id="certifications"
        label="Certifications (gated)"
        value={initial.certifications}
        placeholder={"ASDC Level 4\nSAE J2954\n…"}
      />

      <BulletField
        id="typicalCompanies"
        label="Typical employers (public)"
        value={initial.typicalCompanies}
        placeholder={"Ola Electric\nAther Energy\nTata Motors EV\n…"}
      />

      <BulletField
        id="typicalIndustries"
        label="Typical industries (public)"
        value={initial.typicalIndustries}
        placeholder={"EV OEM\nTier-1 supplier\nBattery start-up\n…"}
      />

      <BulletField
        id="careerPath"
        label="Career path ladder (gated)"
        value={initial.careerPath}
        placeholder={"Junior Battery Engineer\nBattery Engineer\nSenior Battery Engineer\nLead — Battery Systems"}
      />

      <BulletField
        id="reports"
        label="Typically manages (gated)"
        value={initial.reports}
        placeholder={"Battery Engineer\nBattery Test Technician\n…"}
      />

      <BulletField
        id="sampleInterviewQuestions"
        label="Sample interview questions (gated)"
        value={initial.sampleInterviewQuestions}
        placeholder={"Walk me through how you'd design a 60-kWh pack for a passenger EV…\nWhat trade-offs would you make between energy density and safety?…"}
      />

      <Card className="p-5">
        <h2 className="text-section text-emce-text">SEO overrides (optional)</h2>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="metaTitle">Meta title override</Label>
            <Input
              id="metaTitle"
              name="metaTitle"
              defaultValue={initial.metaTitle ?? ""}
              maxLength={160}
              placeholder="Auto-generated from title when blank."
            />
          </div>
          <div>
            <Label htmlFor="metaDescription">Meta description override</Label>
            <Textarea
              id="metaDescription"
              name="metaDescription"
              defaultValue={initial.metaDescription ?? ""}
              maxLength={280}
              rows={2}
              placeholder="Auto-generated from summary when blank."
            />
          </div>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-emce-border bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Create draft"
                : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Generic newline-bullet textarea — used a dozen times above. */
function BulletField({
  id,
  label,
  value,
  placeholder,
}: {
  id: string;
  label: string;
  value: string[];
  placeholder?: string;
}) {
  return (
    <Card className="p-5">
      <Label htmlFor={id}>{label}</Label>
      <p className="mt-0.5 text-hint text-emce-text-muted">
        One entry per line. Blank lines and trailing whitespace are trimmed.
      </p>
      <Textarea
        id={id}
        name={id}
        defaultValue={value.join("\n")}
        rows={Math.min(12, Math.max(4, value.length + 1))}
        placeholder={placeholder}
        className="mt-2 font-mono text-sm"
      />
    </Card>
  );
}
