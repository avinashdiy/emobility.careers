import { permanentRedirect } from "next/navigation";

/**
 * Back-compat redirect — pages used to live at `/p/<slug>`. They
 * now share the top-level URL space with candidate handles, so
 * `/p/<slug>` 308s to `/<slug>`. Search engines pass link equity
 * across, and any inbound link still resolves.
 *
 * The actual page renderer lives in `app/[username]/page.tsx`,
 * which dispatches Page-first then falls through to candidate
 * profile lookup.
 */
export default async function LegacyPageRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/${slug}`);
}
