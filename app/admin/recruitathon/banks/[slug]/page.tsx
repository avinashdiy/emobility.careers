import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import type { MCQQuestion } from "@/server/assessments/actions";

/**
 * Admin — review one Recruitathon JD's question bank: every question,
 * its options (correct one marked), the explanation, and the item type
 * (technical vs aptitude/reasoning/SJT). Filterable by type.
 */
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  technical: "Technical",
  safety: "Safety",
  aptitude: "Aptitude",
  reasoning: "Reasoning",
  sjt: "Situational (fit)",
  untyped: "Technical",
};
const TYPE_BADGE: Record<string, string> = {
  technical: "bg-emce-light-soft text-emce-dark",
  untyped: "bg-emce-light-soft text-emce-dark",
  safety: "bg-emce-red-light text-emce-red-deep",
  aptitude: "bg-emce-mid/30 text-emce-darkest",
  reasoning: "bg-emce-orange-light text-emce-orange-deep",
  sjt: "bg-emce-verified-bg text-emce-verified-text",
};

export default async function AdminBankDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/403");
  const { slug } = await params;
  const { type: filter } = await searchParams;

  const jd = await db.recruitathonJd.findUnique({
    where: { slug },
    select: { company: true, role: true, level: true, assessment: { select: { id: true, durationMins: true, passingScore: true, questions: true } } },
  });
  if (!jd) notFound();

  const all = (jd.assessment?.questions as MCQQuestion[] | undefined) ?? [];
  const counts = all.reduce((m, q) => { const t = q.type ?? "untyped"; m[t] = (m[t] ?? 0) + 1; return m; }, {} as Record<string, number>);
  const questions = filter ? all.filter((q) => (q.type ?? "untyped") === filter || (filter === "technical" && (q.type ?? "untyped") === "untyped")) : all;

  const tabs: { key?: string; label: string; n: number }[] = [
    { key: undefined, label: "All", n: all.length },
    { key: "technical", label: "Technical", n: (counts.technical ?? 0) + (counts.untyped ?? 0) },
    { key: "safety", label: "Safety", n: counts.safety ?? 0 },
    { key: "aptitude", label: "Aptitude", n: counts.aptitude ?? 0 },
    { key: "reasoning", label: "Reasoning", n: counts.reasoning ?? 0 },
    { key: "sjt", label: "Situational", n: counts.sjt ?? 0 },
  ];

  return (
    <div className="container max-w-3xl py-8">
      <nav className="text-hint text-emce-text-muted">
        <Link href="/admin/recruitathon/banks" className="font-bold text-emce-dark hover:underline">Test banks</Link>
        <span className="mx-1.5">›</span>
        <span>{jd.company}</span>
      </nav>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-emce-text">{jd.role}</h1>
      <p className="mt-1 text-sm text-emce-text-sec">
        {jd.company} · {jd.level} · {all.length} questions · {jd.assessment?.durationMins ?? 30} min · pass {jd.assessment?.passingScore ?? 50}%
      </p>

      {!jd.assessment ? (
        <p className="mt-6 text-emce-text-sec">No bank generated for this JD yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Link
                key={t.label}
                href={t.key ? `/admin/recruitathon/banks/${slug}?type=${t.key}` : `/admin/recruitathon/banks/${slug}`}
                className={`rounded-full px-3 py-1 text-xs font-bold ${((filter ?? undefined) === t.key) ? "bg-emce-dark text-emce-light" : "bg-emce-light-soft text-emce-dark hover:bg-emce-mid"}`}
              >
                {t.label} ({t.n})
              </Link>
            ))}
          </div>

          <ol className="mt-5 space-y-3">
            {questions.map((q, i) => {
              const t = q.type ?? "untyped";
              return (
                <li key={i}>
                  <Card className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <p className="font-bold text-emce-text">{q.q}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TYPE_BADGE[t]}`}>{TYPE_LABEL[t]}</span>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {q.options.map((opt, oi) => (
                        <li key={oi} className={oi === q.correctIndex ? "font-bold text-emce-success-deep" : "text-emce-text-sec"}>
                          {String.fromCharCode(65 + oi)}. {opt}{oi === q.correctIndex && " ✓"}
                        </li>
                      ))}
                    </ul>
                    {q.explanation && <p className="mt-2 text-hint text-emce-text-sec"><strong>Why:</strong> {q.explanation}</p>}
                  </Card>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
