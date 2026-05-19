import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/select";
import { AdminShell } from "@/components/layout/admin-shell";
import { ToastFromSearchParams } from "@/components/ui/toast-from-params";
import {
  setUserRole,
  setUserStatus,
  setUserEmail,
  setUserName,
  forceVerifyEmail,
  sendUserPasswordReset,
  softDeleteUser,
} from "@/server/admin/actions";
import { startImpersonation } from "@/server/admin/impersonation";
import { setShadowBan } from "@/server/admin/comment-moderation";
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

  const isSelf = session.user.id === user.id;
  const isDeleted = user.status === "DELETED";

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <ToastFromSearchParams />
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
                {/* DELETED is intentionally absent from the dropdown.
                    The dedicated "Delete user" card below routes
                    through softDeleteUser, which scrubs PII and kills
                    sessions in addition to flipping the status — a
                    plain status flip would leave the user's data
                    public. */}
                <NativeSelect
                  name="status"
                  defaultValue={user.status === "DELETED" ? "SUSPENDED" : user.status}
                  className="flex-1"
                  disabled={isDeleted}
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </NativeSelect>
                <ConfirmSubmit
                  size="sm"
                  variant="destructive"
                  confirm={`Change status for ${fullName}? Suspending blocks sign-in.`}
                  disabled={isDeleted}
                >Save</ConfirmSubmit>
              </form>
              {isDeleted && (
                <p className="mt-2 text-hint italic text-emce-text-sec">
                  This account is DELETED — PII scrubbed, sign-in disabled. Status changes are no-ops.
                </p>
              )}
            </Card>

            {/* Edit identity — fixes signup typos. Touches the User
                row directly (sign-in surface), not the public-profile
                copies on CandidateProfile. Email change clears email
                verification so the user must re-prove ownership. */}
            {!isDeleted && (
              <Card>
                <h2 className="text-section text-emce-text">Edit identity</h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Fix typos in the sign-in email or display name. Email change clears verification.
                </p>
                <form action={setUserEmail} className="mt-3 flex gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <Input
                    type="email"
                    name="email"
                    defaultValue={user.email}
                    aria-label="Sign-in email"
                    className="flex-1"
                    disabled={isSelf}
                  />
                  <ConfirmSubmit
                    size="sm"
                    variant="outline"
                    confirm={`Change sign-in email to the new address? The user will need to re-verify the email.`}
                    disabled={isSelf}
                  >
                    Save email
                  </ConfirmSubmit>
                </form>
                <form action={setUserName} className="mt-2 flex gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <Input
                    type="text"
                    name="name"
                    defaultValue={user.name ?? ""}
                    placeholder="Display name"
                    aria-label="Display name"
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" type="submit">
                    Save name
                  </Button>
                </form>
                {isSelf && (
                  <p className="mt-2 text-hint italic text-emce-text-sec">
                    You can't change your own email from here — use /me/settings.
                  </p>
                )}
              </Card>
            )}

            {/* Email verification override — flips `emailVerifiedAt`
                to now() for users who lost the verification link or
                whose email provider blocked it. Disabled if already
                verified (the action also refuses to no-op). */}
            {!isDeleted && (
              <Card>
                <h2 className="text-section text-emce-text">Email verification</h2>
                {user.emailVerifiedAt ? (
                  <>
                    <Badge variant="verified">
                      Verified {relativeTime(user.emailVerifiedAt)}
                    </Badge>
                    <p className="mt-2 text-hint italic text-emce-text-sec">
                      Email is verified. Use "Edit identity" above to change the email — that clears verification automatically.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-hint text-emce-text-sec">
                      User hasn't verified <code>{user.email}</code>. Force-verify
                      on their behalf if the link expired or got lost.
                    </p>
                    <form action={forceVerifyEmail} className="mt-3">
                      <input type="hidden" name="userId" value={user.id} />
                      <ConfirmSubmit
                        size="sm"
                        variant="outline"
                        confirm={`Mark ${user.email} as verified? Only do this if you've confirmed the email belongs to ${fullName} via another channel.`}
                      >
                        ✓ Force-verify email
                      </ConfirmSubmit>
                    </form>
                  </>
                )}
              </Card>
            )}

            {/* Password reset — triggers the same one-time-link email
                the self-serve /forgot-password flow uses. Admin
                doesn't see or set the new password — the user owns
                that. Works for OAuth-only accounts too (the reset
                flow sets a password if none exists). */}
            {!isDeleted && (
              <Card>
                <h2 className="text-section text-emce-text">Password reset</h2>
                <p className="text-hint text-emce-text-sec">
                  Emails a one-time reset link to <code>{user.email}</code> (1-hour expiry). They set
                  the new password themselves — you never see it.
                </p>
                <form action={sendUserPasswordReset} className="mt-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <ConfirmSubmit
                    size="sm"
                    variant="outline"
                    confirm={`Send a password reset link to ${user.email}? They'll have 1 hour to use it.`}
                  >
                    ✉ Send reset email
                  </ConfirmSubmit>
                </form>
              </Card>
            )}

            {/* Delete user — soft delete with PII scrub + session
                kill. Preserves the User row so application history,
                posts, audit log entries continue to resolve (showing
                as "Deleted user"). Refused on admins, on self, and
                on employers who own a company with applications. */}
            {!isDeleted && user.role !== "ADMIN" && !isSelf && (
              <Card className="border-emce-red-deep/30 bg-emce-red-light/20">
                <h2 className="text-section text-emce-text">Delete user</h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Soft-deletes the account: scrubs name/email/phone/avatar/resume,
                  kills active sessions, disables sign-in. Posts/applications/
                  messages survive as "Deleted user" so other parties don't lose
                  context. Hard-delete is not available — ask engineering for the
                  rare legal-takedown case.
                </p>
                <form action={softDeleteUser} className="mt-3">
                  <input type="hidden" name="userId" value={user.id} />
                  <ConfirmSubmit
                    size="sm"
                    variant="destructive"
                    confirm={`Delete ${user.email}? PII will be scrubbed permanently; active sessions ended; sign-in blocked. Application/post/message history is preserved as "Deleted user". This action cannot be reversed.`}
                  >
                    🗑 Delete user
                  </ConfirmSubmit>
                </form>
              </Card>
            )}

            {/* Impersonate — admin signs in as this user for support
                debugging. Renders a sticky red banner across every
                page until "Back to admin" is clicked. Disabled for
                other admins (we don't allow privilege chains). */}
            {user.role !== "ADMIN" && user.status === "ACTIVE" && (
              <Card>
                <h2 className="text-section text-emce-text">Sign in as user</h2>
                <p className="mt-1 text-hint text-emce-text-sec">
                  Reproduce a bug exactly as {fullName} sees it. Every action
                  is audit-logged against your admin id. Click the red
                  "Back to admin" banner to end.
                </p>
                <form action={startImpersonation} className="mt-3">
                  <input type="hidden" name="targetId" value={user.id} />
                  <ConfirmSubmit
                    size="sm"
                    variant="outline"
                    confirm={`Sign in as ${fullName}? You'll see what they see. The action is audit-logged.`}
                  >
                    Impersonate {fullName}
                  </ConfirmSubmit>
                </form>
              </Card>
            )}

            {/* Shadow ban: silent visibility-PRIVATE on every post +
                hiddenAt on every comment they create. The user keeps
                seeing their own content (so they don't notice). Use
                instead of full SUSPEND when you want plausible
                deniability — spammers rage-create new accounts when
                hard-banned, but go quiet when shadow-banned.
                Skipped on DELETED accounts — they can't post anyway. */}
            {user.role !== "ADMIN" && !isDeleted && (
              <Card>
                <h2 className="text-section text-emce-text">Shadow ban</h2>
                {user.shadowBannedAt ? (
                  <>
                    <Badge variant="danger">Shadow-banned since {user.shadowBannedAt.toLocaleDateString()}</Badge>
                    {user.shadowBanReason && (
                      <p className="mt-2 rounded-md bg-emce-light-soft p-2 text-hint text-emce-text-sec">
                        {user.shadowBanReason}
                      </p>
                    )}
                    <form action={setShadowBan} className="mt-3">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="enable" value="false" />
                      <ConfirmSubmit
                        size="sm"
                        variant="outline"
                        confirm={`Lift shadow-ban on ${fullName}? Future posts and comments will be visible again.`}
                      >
                        Lift shadow-ban
                      </ConfirmSubmit>
                    </form>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-hint text-emce-text-sec">
                      Posts hidden from public feeds, comments auto-hidden, the
                      user never knows. Use for spam patterns where a hard
                      suspend would just lead to a re-signup.
                    </p>
                    <form action={setShadowBan} className="mt-3 space-y-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="enable" value="true" />
                      <Textarea
                        name="reason"
                        rows={2}
                        placeholder="Reason (admin-only)"
                        aria-label="Shadow-ban reason"
                      />
                      <ConfirmSubmit
                        size="sm"
                        variant="destructive"
                        confirm={`Shadow-ban ${fullName}? They won't be able to tell — investigate any appeal request before lifting.`}
                      >
                        Shadow-ban
                      </ConfirmSubmit>
                    </form>
                  </>
                )}
              </Card>
            )}

            {/* Strike history — surfaced for every non-admin user.
                Always-visible because zero strikes is itself useful
                signal ("clean record"). The strike state machine is
                in lib/strikes.ts; the UI here is read-only. Strikes
                are issued automatically when admins hide comments,
                remove flagged posts, or uphold reports. */}
            {user.role !== "ADMIN" && (
              <Card>
                <h2 className="text-section text-emce-text">Moderation strikes</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      user.accountState === "BANNED"
                        ? "danger"
                        : user.accountState === "SUSPENDED"
                          ? "warning"
                          : user.accountState === "WARNED"
                            ? "warning"
                            : "success"
                    }
                  >
                    {user.strikes} strike{user.strikes === 1 ? "" : "s"} · {user.accountState}
                  </Badge>
                  {user.suspendedUntil && user.accountState === "SUSPENDED" && (
                    <span className="text-hint text-emce-text-muted">
                      Until {user.suspendedUntil.toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-hint text-emce-text-sec">
                  3 strikes → 7-day suspension. 5 strikes → permanent ban.
                  Each comment-hide / post-removal automatically issues a
                  strike via the moderation flow.
                </p>
              </Card>
            )}

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
