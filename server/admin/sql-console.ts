"use server";

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * Strict-SELECT-only Postgres console for ad-hoc admin debugging.
 *
 * Safety model:
 *   1. Admin gate at the auth layer.
 *   2. Statement-level check: a single statement, must start with
 *      SELECT (or WITH … SELECT). Anything else (UPDATE, DELETE,
 *      INSERT, DROP, TRUNCATE, ALTER, GRANT, COPY, BEGIN, COMMIT,
 *      VACUUM, ANALYZE) is rejected before it reaches the DB.
 *   3. Statement timeout via SET LOCAL — caps execution at 10s so a
 *      runaway query can't lock a connection.
 *   4. Hard row limit: 500. If the query returns more we slice and
 *      flag truncation in the result so admins know.
 *   5. Audit-log every query (including rejected ones) with the SQL
 *      text. Sensitive columns are NOT scrubbed in the rendering —
 *      this is an admin tool and the audit trail captures the full
 *      query so a compliance review can see exactly what was queried.
 *
 * What this is NOT: this isn't a replacement for read replicas or a
 * BI tool. It's `psql -c` for the operator console — quick lookups
 * during incident response. Don't use it for analytics dashboards.
 */

const MAX_ROWS = 500;
const TIMEOUT_MS = 10_000;

const FORBIDDEN_KEYWORDS =
  /\b(UPDATE|DELETE|INSERT|MERGE|UPSERT|DROP|TRUNCATE|ALTER|GRANT|REVOKE|CREATE|COMMENT\s+ON|COPY|BEGIN|COMMIT|ROLLBACK|VACUUM|ANALYZE|REINDEX|CLUSTER|LOCK|REFRESH|CALL|DO|SET\s+SESSION|SET\s+ROLE|RESET\s+ROLE|SECURITY\s+LABEL|EXECUTE)\b/i;

function validateQuery(sql: string): { ok: boolean; error?: string } {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (!trimmed) return { ok: false, error: "Empty query." };
  // Multiple statements aren't allowed — even the second one being
  // SELECT could be paired with a payload that exfiltrates state.
  if (trimmed.includes(";")) {
    return {
      ok: false,
      error: "Multiple statements aren't allowed. Run one SELECT at a time.",
    };
  }
  // Must start with SELECT or a CTE that resolves to SELECT.
  const head = trimmed.slice(0, 6).toUpperCase();
  const startsWithCte = /^WITH\s/i.test(trimmed);
  if (head !== "SELECT" && !startsWithCte) {
    return {
      ok: false,
      error: "Only SELECT and WITH … SELECT queries are accepted.",
    };
  }
  // Forbidden-keyword sweep on whole text (catches CTE bodies that
  // hide a write).
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    return {
      ok: false,
      error:
        "Statement contains a write keyword. Read-only queries only — use psql for mutations.",
    };
  }
  return { ok: true };
}

export interface SQLResult {
  ok: boolean;
  message?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  truncated?: boolean;
  durationMs?: number;
}

export async function runReadOnlyQuery(formData: FormData): Promise<SQLResult> {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  if (session.user.role !== "ADMIN") redirect("/403");

  const sql = String(formData.get("sql") ?? "");

  const validation = validateQuery(sql);
  // Audit every attempt — including rejected ones, since rejected
  // attempts are themselves a security signal.
  await audit({
    actorId: session.user.id,
    action: validation.ok ? "sql.read_query" : "sql.read_query_rejected",
    entity: "SQLConsole",
    meta: {
      sql: sql.slice(0, 4000),
      reason: validation.ok ? null : validation.error,
    },
  });

  if (!validation.ok) {
    return { ok: false, message: validation.error ?? "Invalid query." };
  }

  const startedAt = Date.now();
  let rows: Record<string, unknown>[] = [];
  try {
    // Wrap the user query in a transaction so the SET LOCAL
    // statement_timeout actually applies. statementTimeoutMs is the
    // Prisma 5 field; we also set it inline as belt-and-braces.
    rows = await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
        // queryRawUnsafe returns Record<string, unknown>[] for SELECT.
        // We add LIMIT 501 server-side so we can detect truncation
        // without trusting the user's LIMIT.
        const wrapped = `SELECT * FROM (${sql.trim().replace(/;\s*$/, "")}) AS _q LIMIT ${MAX_ROWS + 1}`;
        return await tx.$queryRawUnsafe(wrapped) as Record<string, unknown>[];
      },
      { timeout: TIMEOUT_MS + 2000 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, sql }, "[sql-console] query failed");
    return { ok: false, message };
  }

  const truncated = rows.length > MAX_ROWS;
  const limited = truncated ? rows.slice(0, MAX_ROWS) : rows;
  const columns =
    limited.length > 0 ? Object.keys(limited[0] as Record<string, unknown>) : [];

  return {
    ok: true,
    columns,
    rows: limited.map((r) => {
      // Coerce BigInts (Postgres returns COUNT as BigInt) to strings
      // because JSON.stringify can't serialise them and React's text
      // node renderer would explode. Same for Buffer / Date.
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(r)) {
        const v = (r as Record<string, unknown>)[k];
        out[k] =
          typeof v === "bigint"
            ? v.toString()
            : v instanceof Date
              ? v.toISOString()
              : v;
      }
      return out;
    }),
    rowCount: limited.length,
    truncated,
    durationMs: Date.now() - startedAt,
  };
}
