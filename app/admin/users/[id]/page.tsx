import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { setUserRole, setUserStatus } from "@/server/admin/actions";
import { relativeTime } from "@/lib/utils";

export const metadata = { title: "User detail" };

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: {
      candidateProfile: {
        include: {
          _count: {
            select: { applications: true, savedJobs: true, experiences: true, education: true },
          },
        },
      },
      employerProfile: { include: { company: { select: { id: true, name: true, slug: true } } } },
      mentorProfile: true,
      _count: { select: { posts: true, postComments: true, postReactions: true, accounts: true, sessions: true } },
    },
  });
  if (!user) notFound();

  const [
    applicationsCount,
    competitionsRegisteredCount,
    mentorshipBookingsCount,
    mentorshipMentoredCount,
    auditEntries,
  ] = await Promise.all([
    db.application.count({ where: { candidate: { userId: user.id } } }),
    db.competitionRegistration.count({ where: { OR: [{ leaderUserId: user.id }, { members: { some: { userId: user.id } } }] } }),
    db.mentorshipSession.count({ where: { menteeUserId: user.id } }),
    db.mentorshipSession.count({ where: { mentor: { userId: user.id } } }),
    db.auditLog.findMany({
      where: { OR: [{ entity: "User", entityId: user.id }, { actorId: user.id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const cp = user.candidateProfile;
  const fullName = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : (user.name ?? user.email);

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <div>
          <Link href="/admin/users" className="text-sm text-emce-text-sec hover:underline">← All users</Link>
          <h1 className="mt-1 text-dashboard text-emce-text md:text-3xl">{fullName}</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-start gap-4">
              <Avatar src={cp?.profilePhotoUrl} name={fullName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-emce-text">{user.email}</span>
                  {user.emailVerifiedAt && <Badge variant="verified" className="text-[10px]">Verified email</Badge>}
                  {cp?.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐ DIYguru</Badge>}
                  <Badge variant="outline" className="text-[10px]">{user.role}</Badge>
                  <Badge variant={user.status === "ACTIVE" ? "verified" : "warning"} className="text-[10px]">{user.status}</Badge>
                </div>
                {cp?.headline && <p className="mt-1 text-sm text-emce-text-sec">{cp.headline}</p>}
                <p className="mt-1 text-hint text-emce-text-sec">
                  Joined {relativeTime(user.createdAt)}
                  {user.lastLoginAt && ` · last seen ${relativeTime(user.lastLoginAt)}`}
                  {user.phone && ` · ${user.phone}`}
                  {user.locale && ` · locale ${user.locale}`}
                </p>
                {cp?.slug && (
                  <Link href={`/${cp.slug}`} className="mt-2 inline-block text-xs font-bold text-emce-dark hover:underline">
                    View public profile → /{cp.slug}
                  </Link>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Applications" value={applicationsCount} />
              <Stat label="Competitions" value={competitionsRegisteredCount} />
              <Stat label="Mentor sessions" value={mentorshipBookingsCount} />
              <Stat label="As mentor" value={mentorshipMentoredCount} />
              <Stat label="Posts" value={user._count.posts} />
              <Stat label="Comments" value={user._count.postComments} />
              <Stat label="Reactions" value={user._count.postReactions} />
              <Stat label="Linked accounts" value={user._count.accounts} />
            </div>
          </Card>

          <aside className="space-y-4">
            <Card>
              <h2 className="text-section text-emce-text">Change role</h2>
              <form action={setUserRole} className="mt-3 flex gap-2">
                <input type="hidden" name="userId" value={user.id} />
                <NativeSelect name="role" defaultValue={user.role} className="flex-1">
                  <option value="CANDIDATE">Candidate</option>
                  <option value="EMPLOYER">Employer</option>
                  <option value="ADMIN">Admin</option>
                </NativeSelect>
                <ConfirmSubmit
                  size="sm"
                  confirm={`Change role for ${fullName}? This may grant or revoke privileges.`}
                >Save</ConfirmSubmit>
              </form>
            </Card>

            <Card>
              <h2 className="text-section text-emce-text">Account status</h2>
              <form action={setUserStatus} className="mt-3 flex gap-2">
                <input type="hidden" name="userId" value={user.id} />
                <NativeSelect name="status" defaultValue={user.status} className="flex-1">
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="DELETED">Deleted</option>
                </NativeSelect>
                <ConfirmSubmit
                  size="sm"
                  variant="destructive"
                  confirm={`Change status for ${fullName}? Suspending blocks sign-in.`}
                >Save</ConfirmSubmit>
              </form>
            </Card>

            {user.employerProfile && (
              <Card>
                <h2 className="text-section text-emce-text">Employer profile</h2>
                <p className="mt-1 text-sm text-emce-text-sec">
                  {user.employerProfile.designation ?? "—"} at{" "}
                  <Link href={`/companies/${user.employerProfile.company.slug}`} className="font-bold text-emce-dark hover:underline">
                    {user.employerProfile.company.name}
                  </Link>
                </p>
                {user.employerProfile.isCompanyAdmin && (
                  <Badge variant="verified" className="mt-2 text-[10px]">Company admin</Badge>
                )}
              </Card>
            )}

            {user.mentorProfile && (
              <Card>
                <h2 className="text-section text-emce-text">Mentor</h2>
                <p className="mt-1 text-sm text-emce-text-sec">{user.mentorProfile.headline}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge variant={user.mentorProfile.kycStatus === "APPROVED" ? "verified" : "warning"} className="text-[10px]">
                    KYC: {user.mentorProfile.kycStatus}
                  </Badge>
                  <Badge variant={user.mentorProfile.isPublished ? "verified" : "outline"} className="text-[10px]">
                    {user.mentorProfile.isPublished ? "Published" : "Hidden"}
                  </Badge>
                </div>
                <Link href={`/admin/mentors/${user.mentorProfile.id}`} className="mt-2 inline-block text-xs font-bold text-emce-dark hover:underline">
                  Open mentor record →
                </Link>
              </Card>
            )}
          </aside>
        </div>

        <Card>
          <h2 className="text-section text-emce-text">Audit trail</h2>
          {auditEntries.length === 0 ? (
            <p className="mt-2 text-sm text-emce-text-sec">No actions involving this user yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-emce-border text-sm">
              {auditEntries.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 py-2">
                  <div>
                    <p className="font-bold text-emce-text">{a.action.replace(/[._]/g, " ")}</p>
                    <p className="text-hint text-emce-text-sec">
                      {a.entity}{a.entityId ? ` #${a.entityId.slice(0, 8)}` : ""}
                      {a.actorId === user.id && " · by this user"}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase text-emce-text-sec">{relativeTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-emce-border bg-white p-3">
      <div className="text-[10px] uppercase tracking-wide text-emce-text-sec">{label}</div>
      <div className="mt-1 text-xl font-extrabold text-emce-text">{value}</div>
    </div>
  );
}
