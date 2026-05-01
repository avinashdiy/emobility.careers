import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminShell } from "@/components/layout/admin-shell";
import { ArticleEditor } from "@/components/articles/ArticleEditor";

export const metadata: Metadata = { title: "New article" };
export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const categories = await db.articleCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <AdminShell>
      <div className="container max-w-3xl py-8">
        <Link href="/admin/articles" className="text-hint text-emce-dark hover:underline">
          ← All articles
        </Link>
        <div className="mt-4">
          <ArticleEditor categories={categories} />
        </div>
      </div>
    </AdminShell>
  );
}
