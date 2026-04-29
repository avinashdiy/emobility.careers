import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmployerShell } from "@/components/layout/employer-shell";
import { createStage, deleteStage, toggleStageActive } from "@/server/employer/pipeline-actions";

export const metadata = { title: "Custom pipeline stages" };

export default async function PipelinePage() {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
  });
  if (!employer) redirect("/employer/onboarding");
  if (!employer.isCompanyAdmin && session.user.role !== "ADMIN") redirect("/403");

  const stages = await db.customPipelineStage.findMany({
    where: { companyId: employer.companyId },
    orderBy: { order: "asc" },
    include: { slaConfigs: true },
  });

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <h1 className="text-dashboard text-emce-text">Custom pipeline stages</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Add company-specific stages on top of the default ATS flow (Applied → Hired). Set SLAs to flag stuck applications.
        </p>

        <Card className="mt-4 p-6">
          <h2 className="text-section text-emce-text">Add a stage</h2>
          <form action={createStage} className="mt-3 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required maxLength={60} placeholder="e.g. Reference check" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="order">Order</Label>
              <Input id="order" name="order" type="number" defaultValue={stages.length} min="0" max="50" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" name="color" placeholder="#374a47" maxLength={20} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="slaHours">SLA hrs</Label>
              <Input id="slaHours" name="slaHours" type="number" min="0" max="2160" />
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button type="submit" className="w-full">Add</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-0">
          {stages.length === 0 ? (
            <p className="p-6 text-center text-hint text-emce-text-sec">
              No custom stages yet — the default kanban will be used as-is.
            </p>
          ) : (
            <ul className="divide-y divide-emce-border">
              {stages.map((s) => {
                const sla = s.slaConfigs[0];
                return (
                  <li key={s.id} className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emce-text">{s.name}</span>
                        {!s.isActive && <Badge variant="outline">inactive</Badge>}
                      </div>
                      <div className="text-hint text-emce-text-sec">
                        order {s.order}
                        {s.color && ` · ${s.color}`}
                        {sla && ` · SLA ${sla.slaHours}h`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <form action={toggleStageActive}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="isActive" value={s.isActive ? "false" : "true"} />
                        <Button type="submit" size="sm" variant="ghost">
                          {s.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                      <form action={deleteStage}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmSubmit
                          confirm={`Delete stage "${s.name}"? Applications in this stage will revert to the default pipeline.`}
                          size="sm"
                          variant="ghost"
                        >
                          Delete
                        </ConfirmSubmit>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </EmployerShell>
  );
}
