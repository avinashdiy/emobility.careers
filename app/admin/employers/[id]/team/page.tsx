import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  adminAddTeamMember,
  adminRemoveTeamMember,
  adminSetCompanyAdmin,
  adminSetEmployerRole,
} from "@/server/admin/team-actions";
import { Crown, UserMinus, ShieldCheck } from "lucide-react";

export const metadata = { title: "Team — admin" };

export default async function AdminCompanyTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;
  const sp = await searchParams;

  const company = await db.company.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      ownerUserId: true,
      verificationStatus: true,
    },
  });
  if (!company) notFound();

  const team = await db.employerProfile.findMany({
    where: { companyId: id },
    orderBy: [{ isCompanyAdmin: "desc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          candidateProfile: {
            select: { slug: true, firstName: true, lastName: true, profilePhotoUrl: true },
          },
        },
      },
    },
  });

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8">
        <header className="mb-6">
          <Link
            href="/admin/employers"
            className="text-xs font-bold text-emce-dark hover:underline"
          >
            ← Employers
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Avatar src={company.logoUrl} name={company.name} size="md" />
            <div>
              <h1 className="text-dashboard text-emce-text md:text-3xl">{company.name}</h1>
              <p className="text-sm text-emce-text-sec">
                <Link href={`/company/${company.slug}`} className="hover:underline">
                  /company/{company.slug}
                </Link>
                {" · "}
                <Badge variant="outline" className="text-[10px]">
                  {company.verificationStatus}
                </Badge>
              </p>
            </div>
          </div>
        </header>

        {sp.error && (
          <div className="mb-4 rounded-md bg-emce-red-light p-3 text-sm text-emce-red-deep">
            {sp.error}
          </div>
        )}

        {/* Team list */}
        <Card className="p-6">
          <h2 className="text-section text-emce-text">Team · {team.length}</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Multiple admins are supported. Removing someone unlinks them from this
            company; they remain a user on the platform.
          </p>

          {team.length === 0 ? (
            <p className="mt-4 text-hint text-emce-text-muted">
              No team members yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-emce-border">
              {team.map((m) => {
                const cp = m.user.candidateProfile;
                const name = cp
                  ? `${cp.firstName} ${cp.lastName ?? ""}`.trim()
                  : m.user.name ?? m.user.email ?? "Someone";
                const isOwner = m.userId === company.ownerUserId;
                const canPostJobs =
                  m.user.role === "EMPLOYER" || m.user.role === "ADMIN";
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar src={cp?.profilePhotoUrl ?? null} name={name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {cp ? (
                          <Link
                            href={`/${cp.slug}`}
                            className="truncate font-bold text-emce-text hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="truncate font-bold text-emce-text">{name}</span>
                        )}
                        {isOwner && (
                          <Badge variant="warning" className="text-[10px]">
                            <Crown className="mr-1 h-3 w-3" /> Owner
                          </Badge>
                        )}
                        {m.isCompanyAdmin && (
                          <Badge variant="verified" className="text-[10px]">
                            <ShieldCheck className="mr-1 h-3 w-3" /> Company admin
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px]">{m.teamRole}</Badge>
                        <Badge
                          variant={canPostJobs ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          Role: {m.user.role}
                          {!canPostJobs && " (can't post jobs)"}
                        </Badge>
                      </div>
                      <p className="text-hint text-emce-text-sec">
                        {m.designation} · {m.user.email}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {/* Toggle company-admin flag (multi-admin support) */}
                      <form action={adminSetCompanyAdmin}>
                        <input type="hidden" name="companyId" value={company.id} />
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
                          {m.isCompanyAdmin ? "Demote from admin" : "Make admin"}
                        </Button>
                      </form>

                      {/* Bump role to EMPLOYER (or back to CANDIDATE).
                          This is what actually unlocks job posting —
                          adding to the team alone doesn't grant it. */}
                      {!canPostJobs ? (
                        <form action={adminSetEmployerRole}>
                          <input type="hidden" name="userId" value={m.userId} />
                          <input type="hidden" name="role" value="EMPLOYER" />
                          <Button type="submit" size="sm" variant="default">
                            Promote to EMPLOYER
                          </Button>
                        </form>
                      ) : m.user.role === "EMPLOYER" ? (
                        <form action={adminSetEmployerRole}>
                          <input type="hidden" name="userId" value={m.userId} />
                          <input type="hidden" name="role" value="CANDIDATE" />
                          <Button type="submit" size="sm" variant="ghost">
                            Demote to CANDIDATE
                          </Button>
                        </form>
                      ) : null}

                      {/* Remove from team — refused server-side for the
                          company owner. */}
                      {!isOwner && (
                        <form action={adminRemoveTeamMember}>
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="text-emce-orange-deep"
                          >
                            <UserMinus className="mr-1 h-3 w-3" /> Remove
                          </Button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Add new team member */}
        <Card className="mt-4 p-6">
          <h2 className="text-section text-emce-text">Add team member</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Direct add — bypasses the email-invite flow. Supply either the user&apos;s
            registered email <strong>or</strong> their candidate profile slug.
          </p>
          <p className="mt-1 text-hint text-emce-text-muted">
            Note: adding a CANDIDATE-role user only links them to this company. They
            still can&apos;t post jobs until you also click &ldquo;Promote to EMPLOYER&rdquo; on
            their row above.
          </p>

          <form
            action={adminAddTeamMember}
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="companyId" value={company.id} />
            <div className="sm:col-span-2">
              <Label htmlFor="identifier">Email or candidate slug</Label>
              <Input
                id="identifier"
                name="identifier"
                required
                placeholder="alice@diyguru.org or alice-singh"
              />
            </div>
            <div>
              <Label htmlFor="teamRole">Team role</Label>
              <NativeSelect id="teamRole" name="teamRole" required>
                <option value="RECRUITER">Recruiter</option>
                <option value="HIRING_MANAGER">Hiring manager</option>
                <option value="ADMIN">Admin</option>
                <option value="VIEWER">Viewer</option>
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                name="designation"
                required
                placeholder="Talent Acquisition Lead"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="isCompanyAdmin"
                name="isCompanyAdmin"
                type="checkbox"
                value="on"
                className="h-4 w-4"
              />
              <Label htmlFor="isCompanyAdmin" className="!mt-0">
                Mark as company admin (can edit company page + invite teammates)
              </Label>
            </div>

            {/* Verified-company bypass acknowledgement. The self-serve
                `joinExistingCompany` refuses to attach to verified
                companies (impersonation defence); admins can override
                but the action server-checks this box and audit-logs
                the bypass intent. Hidden when the company is still
                UNVERIFIED — that's the routine path. */}
            {(company.verificationStatus === "VERIFIED" ||
              company.verificationStatus === "PENDING") && (
              <div className="sm:col-span-2 rounded-md border border-emce-orange bg-emce-orange-light p-3">
                <div className="flex items-start gap-2">
                  <input
                    id="ackVerifiedBypass"
                    name="ackVerifiedBypass"
                    type="checkbox"
                    value="on"
                    required
                    className="mt-0.5 h-4 w-4"
                  />
                  <Label htmlFor="ackVerifiedBypass" className="!mt-0 text-emce-text">
                    <strong className="text-emce-orange-deep">Verified company —</strong>{" "}
                    {company.name} is{" "}
                    <strong>{company.verificationStatus.toLowerCase()}</strong>. The
                    self-serve join flow refuses this attach to prevent impersonation
                    of established companies. Tick to acknowledge you&apos;re bypassing
                    the gate intentionally; the audit log records this action with
                    your user ID.
                  </Label>
                </div>
              </div>
            )}

            <div className="sm:col-span-2 flex justify-end pt-2">
              <Button type="submit">Add to team</Button>
            </div>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}
