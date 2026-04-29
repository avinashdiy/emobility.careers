import { redirect } from "next/navigation";

// Marketing-tree alias that hands off to the canonical /company/[slug] route.
export default async function MarketingCompanyAlias({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/company/${slug}`);
}
