#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# eMobility Careers — VPS first-time + ongoing setup script
# ─────────────────────────────────────────────────────────────
#
# Run this on the VPS after every deploy that touches:
#   • Prisma schema (new models, columns, enums)
#   • Storage layout (new MinIO buckets)
#
# It's IDEMPOTENT: safe to re-run as many times as you want.
# Steps that are already in place are skipped silently.
#
# What it does:
#   1. Sanity check — verify env file is loaded + required vars present
#   2. Sync Prisma schema to the production Postgres
#      • Prefers `prisma migrate deploy` if migrations exist
#      • Falls back to `prisma db push` if there are no migrations
#        (greenfield case — use db:push the first time, then
#        switch to migrate-deploy once you commit migrations)
#   3. Reconcile MinIO buckets via scripts/setup-buckets.ts
#      • emce-resumes (private)
#      • emce-avatars (public-read)
#      • emce-logos   (public-read)
#      • emce-docs    (private)
#   4. Print a summary
#
# Run via:
#   pnpm setup:vps
#
# Or directly:
#   bash scripts/setup-vps.sh
#
# Exit codes:
#   0  — every step succeeded (or was a no-op)
#   1  — one or more steps failed; details printed inline

set -uo pipefail

# Colour helpers — only emit ANSI when stdout is a TTY so log files
# stay clean.
if [ -t 1 ]; then
  C_RESET="\033[0m"
  C_DIM="\033[2m"
  C_RED="\033[31m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_BOLD="\033[1m"
else
  C_RESET="" C_DIM="" C_RED="" C_GREEN="" C_YELLOW="" C_BOLD=""
fi

step() { printf "\n${C_BOLD}▶ %s${C_RESET}\n" "$1"; }
ok()   { printf "${C_GREEN}  ✓ %s${C_RESET}\n" "$1"; }
warn() { printf "${C_YELLOW}  ⚠ %s${C_RESET}\n" "$1"; }
err()  { printf "${C_RED}  ✗ %s${C_RESET}\n" "$1"; }
info() { printf "${C_DIM}    %s${C_RESET}\n" "$1"; }

OVERALL_RC=0

# ───── Env check ────────────────────────────────────────────
step "Sanity check"

REQUIRED_VARS=(DATABASE_URL S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY)
MISSING=0
for v in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!v:-}" ]; then
    err "Missing env var: $v"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  err "Set the missing variables in .env on the VPS, then re-run."
  exit 1
fi

ok "Required env vars present"
info "DATABASE_URL host: $(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')"
info "S3 endpoint: $S3_ENDPOINT"

# ───── Prisma schema sync ───────────────────────────────────
step "Sync Prisma schema to Postgres"

# Decide between migrate deploy (preferred) and db push (fallback).
MIGRATIONS_DIR="prisma/migrations"
HAS_MIGRATIONS=0
if [ -d "$MIGRATIONS_DIR" ]; then
  if find "$MIGRATIONS_DIR" -mindepth 2 -name "migration.sql" -print -quit 2>/dev/null | grep -q .; then
    HAS_MIGRATIONS=1
  fi
fi

if [ $HAS_MIGRATIONS -eq 1 ]; then
  info "Migrations directory exists — running prisma migrate deploy"
  if pnpm prisma migrate deploy; then
    ok "Schema migrations applied"
  else
    err "prisma migrate deploy failed"
    OVERALL_RC=1
  fi
else
  warn "No migrations found at $MIGRATIONS_DIR — using prisma db push (greenfield)."
  info "Long term: run 'pnpm prisma migrate dev --name <descriptor>' locally,"
  info "commit prisma/migrations/, then this script will switch to migrate deploy."
  if pnpm prisma db push --skip-generate; then
    ok "Schema synced via db push"
  else
    err "prisma db push failed — Postgres unreachable, schema invalid, or write-blocked"
    OVERALL_RC=1
  fi
fi

# ───── Full-text search post-push migration ─────────────────
# Runs the GENERATED tsvector + GIN index DDL that Prisma's `db push`
# can't express. Idempotent — every block guards on pg_attribute /
# IF NOT EXISTS. See scripts/setup-fts.sql for the rationale.
step "Apply FTS post-push (tsvector columns + GIN indexes)"

if [ -z "${DATABASE_URL:-}" ]; then
  warn "DATABASE_URL not set in this shell — skipping FTS post-push."
  warn "Re-run this script with DATABASE_URL exported once you've sourced .env."
elif command -v psql >/dev/null 2>&1; then
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "scripts/setup-fts.sql"; then
    ok "FTS post-push applied"
  else
    err "FTS post-push failed — check the SQL output above"
    OVERALL_RC=1
  fi
else
  warn "psql not found on PATH — install postgresql-client to run the FTS migration."
  warn "Falling back to pnpm-tsx runner (slower but works without psql)."
  if pnpm exec tsx -e "
    const { Client } = require('pg');
    const fs = require('fs');
    (async () => {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      const sql = fs.readFileSync('scripts/setup-fts.sql', 'utf8');
      await c.query(sql);
      await c.end();
      console.log('FTS post-push applied via pg client.');
    })().catch((e) => { console.error(e); process.exit(1); });
  "; then
    ok "FTS post-push applied (via pg client)"
  else
    err "FTS post-push failed via pg client fallback"
    OVERALL_RC=1
  fi
fi

# ───── MinIO bucket reconciliation ──────────────────────────
step "Reconcile MinIO buckets"

if pnpm exec tsx scripts/setup-buckets.ts; then
  ok "Buckets reconciled"
else
  err "Bucket reconciliation failed (see output above)"
  OVERALL_RC=1
fi

# ───── Summary ──────────────────────────────────────────────
step "Summary"

if [ $OVERALL_RC -eq 0 ]; then
  ok "All steps completed."
  printf "\n${C_GREEN}${C_BOLD}eMobility VPS setup complete.${C_RESET}\n"
  info "Next: restart the web + worker containers if they were running before this."
else
  err "One or more steps failed. Resolve the errors above before serving traffic."
  printf "\n${C_RED}${C_BOLD}Setup incomplete.${C_RESET}\n"
fi

exit $OVERALL_RC
