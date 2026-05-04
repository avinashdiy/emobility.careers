import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageEditorForm } from "@/components/admin/PageEditorForm";

export const metadata = { title: "Edit page — admin" };

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const page = await db.page.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      body: true,
      coverImageUrl: true,
      metaTitle: true,
      metaDescription: true,
      renderMode: true,
      allowScripts: true,
      status: true,
      sourceKind: true,
      updatedAt: true,
    },
  });
  if (!page) notFound();

  return (
    <AdminShell>
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <header>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="text-dashboard text-emce-text md:text-3xl">{page.title}</h1>
            <Badge variant={page.status === "PUBLISHED" ? "default" : "outline"} size="sm">
              {page.status}
            </Badge>
            <Badge variant="outline" size="sm">{page.sourceKind}</Badge>
          </div>
          <p className="mt-1 text-sm text-emce-text-sec">
            Public URL:{" "}
            <Link href={`/${page.slug}`} target="_blank" rel="noopener" className="font-bold text-emce-dark hover:underline">
              /{page.slug} ↗
            </Link>
          </p>
        </header>

        <Card className="p-6">
          <PageEditorForm
            page={{
              id: page.id,
              slug: page.slug,
              title: page.title,
              excerpt: page.excerpt,
              body: page.body,
              coverImageUrl: page.coverImageUrl,
              metaTitle: page.metaTitle,
              metaDescription: page.metaDescription,
              renderMode: page.renderMode,
              allowScripts: page.allowScripts,
            }}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
