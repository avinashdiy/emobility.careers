import { redirect } from "next/navigation";
import { signinNextUrl } from "@/lib/auth-redirect";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { EmployerShell } from "@/components/layout/employer-shell";
import { inviteTeammate, revokeInvite, removeTeammate, setTeammateAdmin } from "@/server/employer/team-actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user) redirect(await signinNextUrl());
  const employer = await db.employerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      company: {
        include: {
          team: { include: { user: { select: { id: true, email: true, name: true } } } },
          invites: { include: { invitedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!employer) redirect("/employer/onboarding");

  return (
    <EmployerShell>
      <div className="container max-w-3xl py-10">
        <h1 className="text-dashboard text-emce-text">Team — {employer.company.name}</h1>

        {employer.isCompanyAdmin ? (
          <Card className="mt-4 p-6">
            <h2 className="text-section text-emce-text">Invite a teammate</h2>
            <form action={inviteTeammate} className="mt-3 grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-6">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="sm:col-span-4">
                <Label htmlFor="role">Role</Label>
                <NativeSelect id="role" name="role" defaultValue="RECRUITER">
                  <option value="RECRUITER">Recruiter</option>
                  <option value="HIRING_MANAGER">Hiring manager</option>
                  <option value="VIEWER">Viewer (read-only)</option>
                  <option value="ADMIN">Company admin</option>
                </NativeSelect>
              </div>
              <div className="sm:col-span-2 flex items-end">
                <Button type="submit" className="w-full">Invite</Button>
              </div>
            </form>
          </Card>
        ) : (
          <p className="mt-3 rounded-md bg-emce-light-soft p-3 text-hint text-emce-text-sec">
            Only company admins can invite teammates. Your role: {employer.teamRole}.
          </p>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Members</h2>
          <ul className="mt-3 divide-y divide-emce-border">
            {employer.company.team.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-bold text-emce-text">{m.user.name ?? m.user.email}</div>
                  <div className="text-hint text-emce-text-sec">
                    {m.user.email} · {m.designation ?? ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">{m.teamRole}</Badge>
                  {m.isCompanyAdmin && <Badge variant="verified">Admin</Badge>}
                  {/* Admins can promote / demote any teammate to fellow admin
                      (multi-admin support). Demoting the owner is refused
                      server-side. Self-step-down is allowed only if at
                      least one other admin remains. */}
                  {employer.isCompanyAdmin && (
                    <form action={setTeammateAdmin}>
                      <input type="hidden" name="userId" value={m.userId} />
                      <input
                        type="hidden"
                        name="isCompanyAdmin"
                        value={m.isCompanyAdmin ? "off" : "on"}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant={m.isCompanyAdmin ? "outline" : "ghost"}
                      >
                        {m.isCompanyAdmin ? "Revoke admin" : "Make admin"}
                      </Button>
                    </form>
                  )}
                  {employer.isCompanyAdmin && m.userId !== employer.userId && (
                    <form action={removeTeammate}>
                      <input type="hidden" name="userId" value={m.userId} />
                      <ConfirmSubmit
                        confirm={`Remove ${m.user.name ?? m.user.email} from the team?`}
                        size="sm"
                        variant="ghost"
                      >
                        Remove
                      </ConfirmSubmit>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {employer.company.invites.filter((i) => !i.acceptedAt).length > 0 && (
          <Card className="mt-6 p-6">
            <h2 className="text-section text-emce-text">Pending invites</h2>
            <ul className="mt-3 divide-y divide-emce-border">
              {employer.company.invites.filter((i) => !i.acceptedAt).map((i) => (
                <li key={i.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-bold text-emce-text">{i.email}</div>
                    <div className="text-hint text-emce-text-sec">
                      {i.role} · invited by {i.invitedBy.name ?? "?"} {relativeTime(i.createdAt)}
                    </div>
                  </div>
                  {employer.isCompanyAdmin && (
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={i.id} />
                      <ConfirmSubmit confirm={`Revoke invite to ${i.email}?`} size="sm" variant="ghost">
                        Revoke
                      </ConfirmSubmit>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </EmployerShell>
  );
}
