import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { getMentorKycQueue } from "@/server/mentorship/queries";
import { MentorKycRowActions } from "@/components/mentorship/MentorReviewActions";

export const metadata = { title: "Mentor KYC queue" };

export default async function AdminMentorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "PENDING" | "APPROVED" | "REJECTED" | "ALL" }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";

  const queue = await getMentorKycQueue(status);
  const tabs: typeof status[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

  return (
    <AdminShell>
      <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-dashboard text-emce-text md:text-3xl">Mentor KYC</h1>
          <nav className="flex gap-1 rounded-md border border-emce-border p-1">
            {tabs.map((t) => (
              <Link
                key={t}
                href={`/admin/mentors?status=${t}`}
                className={`rounded px-2.5 py-1 text-xs font-semibold ${t === status ? "bg-emce-light-soft text-emce-darkest" : "text-emce-text-sec hover:text-emce-text"}`}
              >{t}</Link>
            ))}
          </nav>
        </div>

        <div className="space-y-3">
          {queue.length === 0 && (
            <Card className="p-6 text-center text-sm text-emce-text-sec">Queue is empty.</Card>
          )}
          {queue.map((m) => {
            const cp = m.user.candidateProfile;
            const name = cp ? `${cp.firstName} ${cp.lastName ?? ""}`.trim() : "Mentor";
            return (
              <Card key={m.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <Avatar src={cp?.profilePhotoUrl} name={name} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-emce-text">{name}</span>
                        <Badge variant={m.kycStatus === "PENDING" ? "warning" : m.kycStatus === "APPROVED" ? "verified" : "outline"} className="text-[10px]">{m.kycStatus}</Badge>
                        {cp?.isDIYguruVerified && <Badge variant="verified" className="text-[10px]">⭐ DIYguru</Badge>}
                        {cp?.slug && (
                          <Link href={`/${cp.slug}`} className="text-xs text-emce-text-sec hover:underline">/{cp.slug}</Link>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-emce-text">{m.headline}</p>
                      <p className="mt-1 line-clamp-3 text-hint text-emce-text-sec">{m.bio}</p>
                      <p className="mt-1 text-hint text-emce-text-sec">
                        {m.yearsExperience}y exp · {m.expertiseTags.slice(0, 5).join(", ")} · {m.languages.join(", ")}
                      </p>
                    </div>
                  </div>
                  {m.kycStatus === "PENDING" && <MentorKycRowActions mentorId={m.id} />}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
