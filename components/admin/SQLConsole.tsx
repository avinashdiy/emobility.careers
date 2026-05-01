"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { runReadOnlyQuery, type SQLResult } from "@/server/admin/sql-console";
import { Play } from "lucide-react";

const SAMPLES: { label: string; sql: string }[] = [
  {
    label: "Daily signups (last 30d)",
    sql: `SELECT date_trunc('day', "createdAt")::date AS day, COUNT(*) AS signups
FROM "User"
WHERE "createdAt" > NOW() - INTERVAL '30 days'
GROUP BY day
ORDER BY day DESC`,
  },
  {
    label: "Top 20 jobs by application count",
    sql: `SELECT j.title, c.name AS company, COUNT(a.id) AS applications
FROM "JobPosting" j
JOIN "Company" c ON c.id = j."companyId"
LEFT JOIN "Application" a ON a."jobId" = j.id
GROUP BY j.id, c.name
ORDER BY applications DESC
LIMIT 20`,
  },
  {
    label: "Stuck applications (no movement in 14d)",
    sql: `SELECT a.id, a.stage, a."updatedAt", j.title, c.name
FROM "Application" a
JOIN "JobPosting" j ON j.id = a."jobId"
JOIN "Company" c ON c.id = j."companyId"
WHERE a."updatedAt" < NOW() - INTERVAL '14 days'
  AND a.stage NOT IN ('HIRED', 'REJECTED')
ORDER BY a."updatedAt" ASC
LIMIT 100`,
  },
];

export function SQLConsole() {
  const [sql, setSql] = useState(SAMPLES[0].sql);
  const [result, setResult] = useState<SQLResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    const fd = new FormData();
    fd.set("sql", sql);
    startTransition(async () => {
      const r = await runReadOnlyQuery(fd);
      setResult(r);
    });
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-emce-text-muted">Examples:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSql(s.sql)}
              className="rounded-full bg-emce-light-soft px-3 py-1 text-xs font-bold text-emce-text-sec hover:bg-emce-light"
            >
              {s.label}
            </button>
          ))}
        </div>
        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          rows={10}
          aria-label="SQL query"
          spellCheck={false}
          className="mt-3 font-mono text-xs"
          placeholder="SELECT * FROM &quot;User&quot; LIMIT 10"
        />
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={run} disabled={pending} size="sm">
            <Play className="mr-1 h-3.5 w-3.5" aria-hidden />
            {pending ? "Running…" : "Run query"}
          </Button>
          <p className="text-hint text-emce-text-muted">
            Read-only. SELECT / WITH only. Capped at 500 rows · 10s.
          </p>
        </div>
      </Card>

      {result && (
        <Card className="mt-4 p-4">
          {result.ok ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success">{result.rowCount} row{result.rowCount === 1 ? "" : "s"}</Badge>
                {result.truncated && (
                  <Badge variant="warning">Truncated to first 500</Badge>
                )}
                <span className="text-hint text-emce-text-muted">
                  {result.durationMs} ms
                </span>
              </div>
              {result.rows && result.rows.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-emce-light-soft text-left text-[11px] font-bold uppercase text-emce-text-sec">
                      <tr>
                        {result.columns?.map((c) => (
                          <th key={c} scope="col" className="border-b border-emce-border p-2">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emce-border">
                      {result.rows.map((r, i) => (
                        <tr key={i}>
                          {result.columns?.map((c) => (
                            <td key={c} className="max-w-md truncate p-2 font-mono">
                              {r[c] === null
                                ? <span className="text-emce-text-muted">NULL</span>
                                : typeof r[c] === "object"
                                  ? JSON.stringify(r[c])
                                  : String(r[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-hint text-emce-text-sec">No rows returned.</p>
              )}
            </>
          ) : (
            <div className="rounded-md bg-emce-red-light p-3 text-sm text-emce-red">
              <strong>Error:</strong> {result.message}
            </div>
          )}
        </Card>
      )}
    </>
  );
}
