import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";

export const metadata = { title: "Search candidates" };

export default async function TalentSearch({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; profileMode?: string; diyguruOnly?: string; openToWork?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");

  const sp = await searchParams;
  const where: Prisma.CandidateProfileWhereInput = {
    cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
  };
  if (sp.q) {
    where.OR = [
      { firstName: { contains: sp.q, mode: "insensitive" } },
      { lastName: { contains: sp.q, mode: "insensitive" } },
      { headline: { contains: sp.q, mode: "insensitive" } },
      { summary: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.domain) {
    where.evDomains = { some: { evDomain: { slug: sp.domain } } };
  }
  if (sp.profileMode) where.profileMode = sp.profileMode as Prisma.CandidateProfileWhereInput["profileMode"];
  if (sp.diyguruOnly === "true") where.isDIYguruVerified = true;
  if (sp.openToWork === "true") where.openToWork = true;

  const candidates = await db.candidateProfile.findMany({
    where,
    take: 50,
    orderBy: { updatedAt: "desc" },
    include: {
      evDomains: { include: { evDomain: true } },
      skills: { include: { skill: true }, take: 6 },
    },
  });

  const evDomains = await db.eVDomain.findMany({ orderBy: { order: "asc" } });

  return (
    <EmployerShell>
      <div className="container max-w-6xl py-10">
        <h1 className="text-dashboard text-emce-text">Candidate search</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Search the public talent network. Use AI matching from a job for ranked recommendations.
        </p>

        <Card className="mt-6 p-4">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Headline, name, or keyword" />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="domain" defaultValue={sp.domain ?? ""}>
                <option value="">Any domain</option>
                {evDomains.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="profileMode" defaultValue={sp.profileMode ?? ""}>
                <option value="">Any mode</option>
                <option value="FRESHER">Fresher</option>
                <option value="EXPERIENCED">Experienced</option>
                <option value="TECHNICIAN">Technician</option>
                <option value="LEADERSHIP">Leadership</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Search</Button>
            </div>
            <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
              <input type="checkbox" name="diyguruOnly" value="true" defaultChecked={sp.diyguruOnly === "true"} className="h-4 w-4 accent-emce-mid" />
              DIYguru-verified only
            </label>
            <label className="sm:col-span-3 flex items-center gap-2 rounded-md bg-emce-light-soft p-2 text-hint font-bold text-emce-text">
              <input type="checkbox" name="openToWork" value="true" defaultChecked={sp.openToWork === "true"} className="h-4 w-4 accent-emce-mid" />
              Open to work only
            </label>
          </form>
        </Card>

        <p className="mt-6 text-sm text-emce-text-sec">{candidates.length} candidates</p>

        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {candidates.map((c) => {
            const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ");
            return (
              <li key={c.id}>
                <Link href={`/${c.slug}`}>
                  <Card className="h-full">
                    <div className="flex items-start gap-3">
                      <Avatar src={c.profilePhotoUrl} name={fullName} size="md" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-emce-text">{fullName}</h3>
                          {c.isDIYguruVerified && <Badge variant="verified">⭐</Badge>}
                        </div>
                        {c.headline && (
                          <p className="line-clamp-1 text-hint text-emce-text-sec">{c.headline}</p>
                        )}
                        <p className="text-hint text-emce-text-muted">
                          {c.location ?? "—"} · {(c.totalExperienceMonths / 12).toFixed(1)} yrs
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="default">{c.profileMode}</Badge>
                          {c.evDomains.slice(0, 2).map((d) => (
                            <Badge key={d.evDomain.slug} variant="success">{d.evDomain.name}</Badge>
                          ))}
                        </div>
                        {c.skills.length > 0 && (
                          <p className="mt-2 line-clamp-1 text-hint text-emce-text-sec">
                            Skills: {c.skills.map((s) => s.skill.name).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>

        {candidates.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">🔎</div>
            <p className="mt-3 text-section text-emce-text">No candidates match your search</p>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
