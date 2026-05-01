import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { createSkill } from "@/server/admin/actions";
import { SkillTaxonomyTable } from "@/components/admin/SkillTaxonomyTable";

export const metadata = { title: "Skill taxonomy" };

export default async function AdminSkillsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const [skills, evDomains, totalSkills] = await Promise.all([
    db.skill.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 500,
      include: { evDomain: true },
    }),
    db.eVDomain.findMany({ orderBy: { order: "asc" } }),
    db.skill.count(),
  ]);

  // Strip the rows down to the shape the client component needs —
  // smaller payload + no accidental leak of internal columns.
  const tableSkills = skills.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    evDomain: s.evDomain ? { id: s.evDomain.id, name: s.evDomain.name } : null,
  }));
  const tableDomains = evDomains.map((d) => ({ id: d.id, name: d.name }));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Skill taxonomy</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Showing {skills.length.toLocaleString()} of {totalSkills.toLocaleString()} canonical skills across {evDomains.length} EV domains.
        </p>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Add a skill</h2>
          <form action={createSkill} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-6">
              <Label htmlFor="name">Skill name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="sm:col-span-4">
              <Label htmlFor="evDomainId">EV Domain</Label>
              <NativeSelect id="evDomainId" name="evDomainId">
                <option value="">— None —</option>
                {evDomains.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Button type="submit" className="w-full">Add</Button>
            </div>
          </form>
        </Card>

        <SkillTaxonomyTable skills={tableSkills} evDomains={tableDomains} />
      </div>
    </AdminShell>
  );
}
