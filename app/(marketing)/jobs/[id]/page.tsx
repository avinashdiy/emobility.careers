import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";

/**
 * Legacy single-job route. The canonical URL is now `/job/{slug}`
 * (singular), but inbound links from old shares + search-engine
 * indexes still hit this path. Resolve the cuid `id` to the slug and
 * 308-redirect — `permanentRedirect` returns a 308 which is the right
 * code for a URL move (search engines update their index, browsers
 * cache the redirect, POST bodies are preserved if any).
 */
export default async function LegacyJobIdRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await db.jobPosting.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!job) notFound();
  permanentRedirect(`/job/${job.slug}`);
}
