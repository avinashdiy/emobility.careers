import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Public CMS page renderer. Backed by the `Page` table — primarily
 * fed by the WordPress importer, secondarily by a future hand-
 * authored admin form.
 *
 * Visibility:
 *   • PUBLISHED — public.
 *   • DRAFT — admin-only preview (banner shown).
 *   • ARCHIVED — public for SEO continuity, banner shown.
 *
 * Body is dangerouslySetInnerHTML — safe because the sanitiser at
 * write-time (lib/cms/wordpress-import.ts → sanitizeWordPressBody)
 * is the trust boundary. The admin "edit body" form (when it ships)
 * MUST run the same sanitiser before save.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await db.page.findUnique({
    where: { slug },
    select: {
      title: true,
      excerpt: true,
      coverImageUrl: true,
      status: true,
      metaTitle: true,
      metaDescription: true,
    },
  });
  if (!page || page.status === "DRAFT") {
    return { title: "Page not found", robots: { index: false, follow: false } };
  }
  const description = page.metaDescription ?? page.excerpt ?? undefined;
  return {
    title: page.metaTitle ?? page.title,
    description,
    alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL}/p/${slug}` },
    openGraph: {
      type: "article",
      url: `${env.NEXT_PUBLIC_APP_URL}/p/${slug}`,
      title: page.metaTitle ?? page.title,
      description,
      images: page.coverImageUrl ? [page.coverImageUrl] : undefined,
    },
    twitter: {
      card: page.coverImageUrl ? "summary_large_image" : "summary",
      title: page.metaTitle ?? page.title,
      description,
    },
    // ARCHIVED → keep crawlable (existing inbound links still work)
    // but signal noindex so we don't compete with the canonical
    // replacement piece.
    robots:
      page.status === "ARCHIVED"
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}

export default async function PublicCmsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();

  const page = await db.page.findUnique({ where: { slug } });
  if (!page) notFound();

  const isAdmin = session?.user?.role === "ADMIN";
  if (page.status === "DRAFT" && !isAdmin) notFound();
  const previewMode = page.status === "DRAFT" && isAdmin;

  return (
    <>
      <SiteHeader />
      {previewMode && (
        <div className="bg-emce-orange-light py-2 text-center text-sm text-emce-text">
          <strong>Draft preview</strong> — not visible to the public.{" "}
          <Link
            href="/admin/pages"
            className="font-bold text-emce-dark underline"
          >
            Open admin →
          </Link>
        </div>
      )}
      {page.status === "ARCHIVED" && !previewMode && (
        <div className="bg-emce-light-soft py-2 text-center text-hint text-emce-text-sec">
          📦 This page is archived but the link stays live.
        </div>
      )}

      <main className="min-h-screen bg-white">
        {page.coverImageUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.coverImageUrl}
              alt=""
              className="aspect-[3/1] w-full object-cover"
            />
          </div>
        ) : null}

        <article className="container max-w-4xl py-8 md:py-12">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-emce-text md:text-4xl">
            {page.title}
          </h1>
          {page.excerpt && (
            <p className="mt-3 text-lg text-emce-text-sec">{page.excerpt}</p>
          )}

          {/*
            Sanitised at write-time — see lib/cms/wordpress-import.ts.
            The `cms-page` wrapper class scopes any inline <style>
            tags from imported WordPress pages, keeping their custom
            CSS from leaking onto SiteHeader / SiteFooter chrome.
          */}
          <div
            className="cms-page mt-8"
            dangerouslySetInnerHTML={{ __html: page.body }}
          />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
