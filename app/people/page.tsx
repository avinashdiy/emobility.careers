import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { ConnectButton } from "@/components/social/ConnectButton";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getConnectionStatus } from "@/server/social/queries";

export const metadata = { title: "Discover people in EV" };

const PERSON_TYPE_OPTIONS = [
  { value: "", label: "Any role" },
  { value: "PROFESSIONAL", label: "Professionals" },
  { value: "STUDENT", label: "Students" },
  { value: "TRAINER", label: "Trainers" },
  { value: "FACULTY", label: "Faculty" },
  { value: "TPO", label: "Placement officers" },
  { value: "EXPERT", label: "Industry experts" },
  { value: "COMPANY_REP", label: "Company leadership" },
];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; domain?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;

  const where: Prisma.CandidateProfileWhereInput = {
    cvVisibility: { in: ["EVERYONE", "EMPLOYERS_ONLY"] },
  };
  if (sp.q) {
    where.OR = [
      { firstName: { contains: sp.q, mode: "insensitive" } },
      { lastName: { contains: sp.q, mode: "insensitive" } },
      { headline: { contains: sp.q, mode: "insensitive" } },
      { institution: { contains: sp.q, mode: "insensitive" } },
    ];
  }
  if (sp.type) where.personType = sp.type as Prisma.CandidateProfileWhereInput["personType"];
  if (sp.domain) where.evDomains = { some: { evDomain: { slug: sp.domain } } };

  const [people, evDomains] = await Promise.all([
    db.candidateProfile.findMany({
      where,
      take: 60,
      orderBy: [{ followersCount: "desc" }, { connectionsCount: "desc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true } },
        evDomains: { include: { evDomain: true } },
      },
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
  ]);

  return (
    <>
      <SiteHeader />
      <div className="container max-w-5xl py-8">
        <h1 className="text-dashboard text-emce-text md:text-3xl">Discover people in EV</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Connect with engineers, researchers, students, faculty, and industry experts across the EV ecosystem.
        </p>

        <Card className="mt-6">
          <form className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Name, headline, or institution" />
            </div>
            <div className="sm:col-span-3">
              <NativeSelect name="type" defaultValue={sp.type ?? ""}>
                {PERSON_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <NativeSelect name="domain" defaultValue={sp.domain ?? ""}>
                <option value="">Any domain</option>
                {evDomains.map((d) => (
                  <option key={d.slug} value={d.slug}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full">Search</Button>
            </div>
          </form>
        </Card>

        <p className="mt-4 text-sm text-emce-text-sec">{people.length} people</p>

        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {await Promise.all(people.map(async (p) => {
            const fullName = `${p.firstName} ${p.lastName ?? ""}`.trim();
            const status = session?.user
              ? await getConnectionStatus(session.user.id, p.user.id)
              : { status: "NONE" as const };
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <Link href={`/${p.slug}`} className="block">
                    <div className="flex items-start gap-3">
                      <Avatar src={p.profilePhotoUrl} name={fullName} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-emce-text hover:underline">{fullName}</span>
                          {p.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐</Badge>}
                        </div>
                        {p.headline && (
                          <p className="line-clamp-2 text-hint text-emce-text-sec">{p.headline}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">{p.personType}</Badge>
                          {p.evDomains.slice(0, 2).map((d) => (
                            <Badge key={d.evDomain.name} variant="default" className="text-[10px]">
                              {d.evDomain.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Link>
                  <div className="mt-3">
                    {session?.user ? (
                      <ConnectButton
                        targetUserId={p.user.id}
                        initialStatus={
                          status.status === "ACCEPTED" ? "ACCEPTED"
                          : status.status === "PENDING_OUT" ? "PENDING_OUT"
                          : status.status === "PENDING_IN" ? "PENDING_IN"
                          : p.user.id === session.user.id ? "SELF" : "NONE"
                        }
                        connectionId={status.connectionId}
                      />
                    ) : (
                      <ConnectButton targetUserId={p.user.id} initialStatus="ANON" />
                    )}
                  </div>
                </Card>
              </li>
            );
          }))}
        </ul>

        {people.length === 0 && (
          <Card className="mt-6 p-10 text-center">
            <div className="text-4xl">🔎</div>
            <p className="mt-3 text-section text-emce-text">No people match your search</p>
          </Card>
        )}
      </div>
      <SiteFooter />
    </>
  );
}
