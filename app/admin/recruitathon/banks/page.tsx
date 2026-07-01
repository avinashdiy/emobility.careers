import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import type { MCQQuestion } from "@/server/assessments/actions";

/**
 * Admin — Recruitathon question-bank review index. Lists every JD with
 * its bank status + the technical/psychometric composition so an admin
 * can spot-check before sharing the test link.
 */
export const dynamic = "force-dynamic";

const LEVEL_BADGE: Record<string, string> = {
  BASIC: "bg-emce-light-soft text-emce-dark",
  INTERMEDIATE: "bg-emce-mid/30 text-emce-darkest",
  ADVANCED: "bg-emce-dark text-emce-light",
};

function composition(questions: MCQQuestion[]) {
  const c = { technical: 0, aptitude: 0, reasoning: 0, sjt: 0, untyped: 0 };
  for (const q of questions) {
    const t = q.type ?? "untyped";
    if (t in c) (c as Record<string, number>)[t] += 1;
    else c.untyped += 1;
  }
  return c;
}

export default async function AdminBanksPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");

  const jds = await db.recruitathonJd.findMany({
    orderBy: [{ company: "asc" }, { sortOrder: "asc" }],
    select: {
      slug: true, company: true, role: true, level: true,
      assessment: { select: { id: true, questions: true } },
    },
  });

  const byCompany = new Map<string, typeof jds>();
  for (const jd of jds) {
    const arr = byCompany.get(jd.company) ?? [];
    arr.push(jd);
    byCompany.set(jd.company, arr);
  }

  const withBank = jds.filter((j) => j.assessment).length;
  const totalQ = jds.reduce((n, j) => n + ((j.assessment?.questions as MCQQuestion[] | undefined)?.length ?? 0), 0);

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-emce-text">Recruitathon test banks</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        {jds.length} JDs · {withBank} with a bank · {totalQ.toLocaleString()} questions. Click a role to review its questions + answers.
      </p>

      <div className="mt-6 space-y-5">
        {Array.from(byCompany.entries()).map(([company, list]) => (
          <div key={company}>
            <h2 className="text-section text-emce-text">{company}</h2>
            <div className="mt-2 space-y-2">
              {list.map((jd) => {
                const qs = (jd.assessment?.questions as MCQQuestion[] | undefined) ?? [];
                const c = composition(qs);
                const psych = c.aptitude + c.reasoning + c.sjt;
                return (
                  <Link key={jd.slug} href={`/admin/recruitathon/banks/${jd.slug}`} className="block">
                    <Card className="flex items-center justify-between gap-3 p-4 transition hover:border-emce-mid">
                      <div className="min-w-0">
                        <p className="font-bold text-emce-text">{jd.role}</p>
                        <p className="text-hint text-emce-text-sec">
                          {jd.assessment
                            ? `${qs.length} questions · ${c.technical + c.untyped} technical · ${psych} aptitude/reasoning/SJT`
                            : "No bank yet"}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${LEVEL_BADGE[jd.level] ?? ""}`}>{jd.level}</span>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
