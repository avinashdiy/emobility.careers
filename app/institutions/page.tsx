import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import type { InstitutionType, Prisma } from "@prisma/client";

// SEO-tuned metadata — title keyword-rich for the long-tail
// "EV colleges India" / "ITI EV training" SERP cluster.
export const metadata: Metadata = {
  title: "EV-industry colleges, polytechnics & ITIs in India",
  description:
    "Browse universities, colleges, polytechnics, ITIs, research institutes, and training centres that produce India's EV-industry workforce. Discover EV-focused programs, alumni networks, and campus placement opportunities on emobility.careers.",
  alternates: { canonical: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/institutions` },
  openGraph: {
    type: "website",
    url: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/institutions`,
    title: "EV-industry colleges, polytechnics & ITIs in India",
    description:
      "Browse universities, colleges, polytechnics, ITIs, research institutes, and training centres producing India's EV workforce.",
    siteName: "emobility.careers",
  },
  twitter: {
    card: "summary_large_image",
    title: "EV-industry colleges, polytechnics & ITIs in India",
    description:
      "Browse universities, colleges, polytechnics, ITIs, research institutes, and training centres producing India's EV workforce.",
  },
};

const TYPE_OPTIONS: { value: InstitutionType | ""; label: string }[] = [
  { value: "", label: "Any type" },
  { value: "UNIVERSITY", label: "University" },
  { value: "COLLEGE", label: "College" },
  { value: "ITI", label: "ITI" },
  { value: "POLYTECHNIC", label: "Polytechnic" },
  { value: "RESEARCH_INSTITUTE", label: "Research Institute" },
  { value: "TRAINING_CENTER", label: "Training Center" },
  { value: "SCHOOL", label: "School" },
  { value: "OTHER", label: "Other" },
];

export default async function InstitutionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: InstitutionType; city?: string }>;
}) {
  const sp = await searchParams;

  const where: Prisma.InstitutionWhereInput = {
    verificationStatus: { not: "REJECTED" },
  };
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q, mode: "insensitive" } },
      { shortName: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.type) where.type = sp.type;
  if (sp.city) where.city = { contains: sp.city, mode: "insensitive" };

  const list = await db.institution.findMany({
    where,
    take: 60,
    orderBy: [{ verificationStatus: "desc" }, { name: "asc" }],
    include: { _count: { select: { educationLinks: true } } },
  });

  return (
    <>
      <SiteHeader />
      <div className="container max-w-6xl py-6 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-dashboard text-emce-text md:text-3xl">Schools & colleges</h1>
            <p className="mt-1 max-w-2xl text-sm text-emce-text-sec">
              Universities, polytechnics, ITIs, and training centres represented on eMobility Careers.
              Add yours from the education section of your profile.
            </p>
          </div>
        </div>

        {/* Prominent secondary nav to the editorial rankings page —
            mirrors the /companies → /companies/a-z affordance. Surfaced
            up here so first-time visitors see the curated leaderboard
            before scrolling into the faceted listing. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emce-border bg-emce-light-soft p-4">
          <p className="text-body text-emce-text">
            Want the curated leaderboard?{" "}
            <span className="text-emce-text-sec">
              See the top EV universities, colleges and training centres
              ranked across research, faculty, placement, infrastructure,
              content quality, alumni and startups.
            </span>
          </p>
          <Link
            href="/institutions/rankings"
            className="inline-flex h-10 items-center justify-center rounded-md bg-emce-dark px-5 text-sm font-bold text-white hover:bg-emce-darkest"
          >
            🏆 EV institution rankings →
          </Link>
        </div>

        <Card className="mt-6">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name or short name (e.g. IIT Delhi)" />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="type" defaultValue={sp.type ?? ""}>
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Input name="city" defaultValue={sp.city ?? ""} placeholder="City" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Search</Button>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-sm text-emce-text-sec">{list.length} institutions</p>

        {list.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon="🎓"
            title="No institutions match your filters"
            body="Try clearing the filters or check the spelling."
          />
        ) : (
          <ul className="emce-stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((i) => (
              <li key={i.id}>
                <Card className="h-full p-4">
                  <Link href={`/institutions/${i.slug}`} className="flex items-start gap-3">
                    <Avatar src={i.logoUrl} name={i.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold text-emce-text hover:underline">{i.name}</span>
                        {i.verificationStatus === "VERIFIED" && (
                          <Badge variant="verified" className="text-[10px]">Verified</Badge>
                        )}
                      </div>
                      <p className="text-hint text-emce-text-sec">
                        {i.type.replace("_", " ")}{i.city ? ` · ${i.city}` : ""}
                      </p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        {i._count.educationLinks} alumni on platform
                      </p>
                    </div>
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
