import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageEditorForm } from "@/components/admin/PageEditorForm";

export const metadata = { title: "New page — admin" };

/**
 * Hand-author a new CMS page from pasted HTML. Lands as DRAFT;
 * the admin publishes from /admin/pages once it looks right.
 */
export default async function NewPagePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  return (
    <AdminShell>
      <div className="space-y-6 px-4 py-6 lg:px-8 lg:py-8">
        <header>
          <h1 className="text-dashboard text-emce-text md:text-3xl">New page</h1>
          <p className="mt-1 text-sm text-emce-text-sec">
            Paste full HTML — Elementor exports, hand-written landing pages, AI tools.
            Saves as DRAFT; publish from{" "}
            <Link href="/admin/pages" className="font-bold text-emce-dark hover:underline">
              /admin/pages
            </Link>{" "}
            when ready.
          </p>
        </header>

        <Card className="p-6">
          <PageEditorForm />
        </Card>
      </div>
    </AdminShell>
  );
}
