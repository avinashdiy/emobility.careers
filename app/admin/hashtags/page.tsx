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
import {
  createHashtagPolicy,
  deleteHashtagPolicy,
} from "@/server/admin/hashtag-actions";
import Link from "next/link";

export const metadata = { title: "Hashtags" };
export const dynamic = "force-dynamic";

const STATE_TONE = {
  FEATURED: "success",
  BLOCKED: "danger",
  MERGED_INTO: "warning",
} as const;

export default async function HashtagsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const sp = await searchParams;

  const [policies, trending] = await Promise.all([
    db.hashtagPolicy.findMany({
      orderBy: [{ state: "asc" }, { tag: "asc" }],
      include: { createdBy: { select: { name: true, email: true } } },
    }),
    // Trending tags: top 30 by post count over last 30 days. Pulled
    // via raw SQL because hashtags is a text[] and we need GROUP BY
    // unnest. Same shape every other admin trending list uses.
    db.$queryRaw<{ tag: string; post_count: bigint }[]>`
      SELECT lower(t) AS tag, COUNT(*) AS post_count
      FROM "Post", unnest("hashtags") AS t
      WHERE "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY lower(t)
      ORDER BY post_count DESC
      LIMIT 30
    `,
  ]);

  const policyMap = new Map(policies.map((p) => [p.tag, p]));

  return (
    <AdminShell>
      <div className="container max-w-5xl py-10">
        <h1 className="text-dashboard text-emce-text">Hashtags</h1>
        <p className="mt-1 text-sm text-emce-text-sec">
          Promote, block, or merge hashtags. Tags without a policy behave
          normally. Featured tags appear in the explore surface; blocked tags
          are hidden from trending and search; merged tags rewrite to a
          canonical tag at extract time.
        </p>

        {sp.error && (
          <div className="mt-3 rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
            {sp.error}
          </div>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Add / update policy</h2>
          <form action={createHashtagPolicy} className="mt-4 grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <Label htmlFor="tag">Tag</Label>
              <Input id="tag" name="tag" placeholder="ev-jobs" required />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="state">State</Label>
              <NativeSelect id="state" name="state" defaultValue="FEATURED">
                <option value="FEATURED">Featured</option>
                <option value="BLOCKED">Blocked</option>
                <option value="MERGED_INTO">Merged into</option>
              </NativeSelect>
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="mergedInto">Merge target (if merged)</Label>
              <Input id="mergedInto" name="mergedInto" placeholder="canonical-tag" />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="displayName">Display name (featured)</Label>
              <Input id="displayName" name="displayName" placeholder="EV Jobs India" />
            </div>
            <div className="sm:col-span-9">
              <Label htmlFor="reason">Reason (admin-only)</Label>
              <Input id="reason" name="reason" placeholder="e.g. duplicate of #ev-careers" />
            </div>
            <div className="sm:col-span-3 flex items-end">
              <Button type="submit" className="w-full">Save policy</Button>
            </div>
          </form>
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Active policies</h2>
          {policies.length === 0 ? (
            <p className="mt-3 text-hint text-emce-text-sec">No policies yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {policies.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emce-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tag/${p.tag}`}
                        className="font-bold text-emce-text hover:underline"
                      >
                        #{p.tag}
                      </Link>
                      <Badge variant={STATE_TONE[p.state]}>{p.state}</Badge>
                      {p.displayName && (
                        <span className="text-hint text-emce-text-sec">
                          → "{p.displayName}"
                        </span>
                      )}
                      {p.mergedInto && (
                        <span className="text-hint text-emce-text-sec">
                          → #{p.mergedInto}
                        </span>
                      )}
                    </div>
                    {p.reason && (
                      <p className="mt-1 text-hint text-emce-text-muted">{p.reason}</p>
                    )}
                  </div>
                  <form action={deleteHashtagPolicy}>
                    <input type="hidden" name="tag" value={p.tag} />
                    <ConfirmSubmit
                      confirm={`Remove policy for #${p.tag}? The tag returns to default behaviour.`}
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </ConfirmSubmit>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-section text-emce-text">Trending (last 30 days)</h2>
          <p className="mt-1 text-hint text-emce-text-sec">
            Top tags by post count. Click "Add policy" to feature, block, or merge.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {trending.map((t) => {
              const existing = policyMap.get(t.tag);
              return (
                <li
                  key={t.tag}
                  className="flex items-center justify-between gap-2 rounded-md bg-emce-light-soft p-2 text-sm"
                >
                  <Link href={`/tag/${t.tag}`} className="font-bold hover:underline">
                    #{t.tag}
                  </Link>
                  <span className="text-emce-text-muted">
                    {Number(t.post_count).toLocaleString()} posts
                  </span>
                  {existing ? (
                    <Badge variant={STATE_TONE[existing.state]}>{existing.state}</Badge>
                  ) : (
                    <Badge variant="outline">No policy</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
