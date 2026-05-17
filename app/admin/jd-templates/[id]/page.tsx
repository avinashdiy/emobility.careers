import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/layout/admin-shell";
import { JDTemplateEditor } from "@/components/jd/JDTemplateEditor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import {
  publishJDTemplate,
  unpublishJDTemplate,
  archiveJDTemplate,
  deleteJDTemplate,
} from "@/server/admin/jd-template-actions";

export const metadata: Metadata = { title: "Edit JD template · Admin" };
export const dynamic = "force-dynamic";

export default async function EditJDTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const { id } = await params;
  const sp = await searchParams;

  const [jd, evDomains] = await Promise.all([
    db.jobDescriptionTemplate.findUnique({ where: { id } }),
    db.eVDomain.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  if (!jd) notFound();

  return (
    <AdminShell>
      <div className="container max-w-3xl py-8">
        <ToastFromSearchParams />
        <Link href="/admin/jd-templates" className="text-hint text-emce-dark hover:underline">
          ← All JD templates
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text">{jd.title}</h1>
            <p className="mt-1 text-hint text-emce-text-muted">
              <StatusBadge status={jd.status} /> · /jd/{jd.slug}
            </p>
          </div>
          <Link
            href={`/jd/${jd.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-hint font-bold text-emce-dark hover:underline"
          >
            View on site ↗
          </Link>
        </div>

        {sp.error && (
          <div className="mt-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        {/* Lifecycle action bar — publish / unpublish / archive /
            delete. Each is a tiny form posting to a dedicated
            server action. */}
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-hint text-emce-text-sec">
              Status:{" "}
              <strong className="text-emce-text">{jd.status}</strong>
              {jd.publishedAt && (
                <> · first published {jd.publishedAt.toISOString().slice(0, 10)}</>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {jd.status !== "PUBLISHED" && (
                <form action={publishJDTemplate}>
                  <input type="hidden" name="id" value={jd.id} />
                  <Button type="submit" size="sm">
                    🚀 Publish
                  </Button>
                </form>
              )}
              {jd.status === "PUBLISHED" && (
                <form action={unpublishJDTemplate}>
                  <input type="hidden" name="id" value={jd.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Move to draft
                  </Button>
                </form>
              )}
              {jd.status !== "ARCHIVED" && (
                <form action={archiveJDTemplate}>
                  <input type="hidden" name="id" value={jd.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Archive
                  </Button>
                </form>
              )}
              <form action={deleteJDTemplate}>
                <input type="hidden" name="id" value={jd.id} />
                <ConfirmSubmit
                  size="sm"
                  variant="destructive"
                  confirm={`Permanently delete "${jd.title}"? Cannot be undone.`}
                >
                  Delete
                </ConfirmSubmit>
              </form>
            </div>
          </div>
        </Card>

        <div className="mt-6">
          <JDTemplateEditor
            mode="edit"
            evDomains={evDomains}
            initial={{
              id: jd.id,
              slug: jd.slug,
              title: jd.title,
              alternativeTitles: jd.alternativeTitles,
              summary: jd.summary,
              overview: jd.overview,
              collarType: jd.collarType,
              seniority: jd.seniority,
              functionalArea: jd.functionalArea,
              evDomainId: jd.evDomainId,
              typicalCompanies: jd.typicalCompanies,
              typicalIndustries: jd.typicalIndustries,
              responsibilities: jd.responsibilities,
              requirements: jd.requirements,
              preferredQualifications: jd.preferredQualifications,
              keySkills: jd.keySkills,
              tools: jd.tools,
              certifications: jd.certifications,
              experienceMinYears: jd.experienceMinYears,
              experienceMaxYears: jd.experienceMaxYears,
              salaryMinLakhs: jd.salaryMinLakhs,
              salaryMedianLakhs: jd.salaryMedianLakhs,
              salaryMaxLakhs: jd.salaryMaxLakhs,
              salaryCurrency: jd.salaryCurrency,
              salaryPeriod: jd.salaryPeriod,
              salaryRoleQuery: jd.salaryRoleQuery,
              careerPath: jd.careerPath,
              reportsTo: jd.reportsTo,
              reports: jd.reports,
              sampleInterviewQuestions: jd.sampleInterviewQuestions,
              demandSignal: jd.demandSignal,
              remoteFriendly: jd.remoteFriendly,
              growthOutlook: jd.growthOutlook,
              metaTitle: jd.metaTitle,
              metaDescription: jd.metaDescription,
            }}
          />
        </div>
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "PUBLISHED") return <Badge variant="success" size="sm">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="outline" size="sm">Archived</Badge>;
  return <Badge variant="warning" size="sm">Draft</Badge>;
}
