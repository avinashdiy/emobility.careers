import { ogCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/card";

export const runtime = "nodejs";
export const revalidate = 86400;
export const alt = "Tagged content on emobility.careers";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/**
 * Tag share card. Derives the headline from the URL slug only — NO DB
 * query, so it renders instantly and never times out the crawler. The
 * slug is humanised (kebab-case → Title Case) for display.
 */
export default function Image({ params }: { params: { slug: string } }) {
  const label = params.slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  return ogCard({
    eyebrow: "Topic",
    title: `Everything tagged "${label}".`,
    subtitle:
      "Jobs, companies, posts and people across this corner of the EV industry.",
    chips: ["Jobs", "Companies", "Posts", "People"],
    footerLeft: `#${label} on emobility.careers`,
  });
}
