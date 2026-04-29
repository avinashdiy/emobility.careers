import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { createSkill, deleteSkill } from "@/server/admin/actions";

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

        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-emce-light-soft text-left text-xs font-bold uppercase text-emce-text-sec">
              <tr>
                <th className="p-3">Skill</th>
                <th className="p-3">Domain</th>
                <th className="p-3">Slug</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emce-border">
              {skills.map((s) => (
                <tr key={s.id}>
                  <td className="p-3 font-bold text-emce-text">{s.name}</td>
                  <td className="p-3">
                    {s.evDomain ? <Badge variant="success">{s.evDomain.name}</Badge> : "—"}
                  </td>
                  <td className="p-3 text-hint text-emce-text-muted">{s.slug}</td>
                  <td className="p-3 text-right">
                    <form action={deleteSkill}>
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmSubmit
                        confirm={`Delete skill "${s.name}"? Candidates with this skill will lose the link.`}
                        size="sm"
                        variant="ghost"
                      >
                        Delete
                      </ConfirmSubmit>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AdminShell>
  );
}
