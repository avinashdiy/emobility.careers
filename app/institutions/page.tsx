import Link from "next/link";
import { db } from "@/lib/db";
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

export const metadata = {
  title: "Schools & colleges",
  description: "Discover universities, colleges, and training institutes that produce EV-industry talent.",
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
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
