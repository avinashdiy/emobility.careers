import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/layout/admin-shell";
import { JDTemplateEditor } from "@/components/jd/JDTemplateEditor";

export const metadata: Metadata = { title: "New JD template · Admin" };
export const dynamic = "force-dynamic";

export default async function NewJDTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const evDomains = await db.eVDomain.findMany({
    where: { isActive: true },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <AdminShell>
      <div className="container max-w-3xl py-8">
        <Link href="/admin/jd-templates" className="text-hint text-emce-dark hover:underline">
          ← All JD templates
        </Link>
        <h1 className="mt-2 text-dashboard text-emce-text">New JD template</h1>
        <p className="mt-1 text-hint text-emce-text-sec">
          Created rows land as DRAFT — open the edit page and click Publish when ready.
        </p>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        <div className="mt-6">
          <JDTemplateEditor
            mode="create"
            evDomains={evDomains}
            initial={{
              title: "",
              alternativeTitles: [],
              summary: "",
              overview: "",
              collarType: "WHITE",
              seniority: "MID",
              functionalArea: "ENGINEERING",
              evDomainId: null,
              typicalCompanies: [],
              typicalIndustries: [],
              responsibilities: [],
              requirements: [],
              preferredQualifications: [],
              keySkills: [],
              tools: [],
              certifications: [],
              experienceMinYears: 0,
              experienceMaxYears: 2,
              salaryMinLakhs: null,
              salaryMedianLakhs: null,
              salaryMaxLakhs: null,
              salaryCurrency: "INR",
              salaryPeriod: "YEARLY",
              salaryRoleQuery: null,
              careerPath: [],
              reportsTo: null,
              reports: [],
              sampleInterviewQuestions: [],
              demandSignal: null,
              remoteFriendly: false,
              growthOutlook: null,
              metaTitle: null,
              metaDescription: null,
            }}
          />
        </div>
      </div>
    </AdminShell>
  );
}
