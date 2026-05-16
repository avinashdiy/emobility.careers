# Deploying emobility.careers

**No CI/CD. No Docker. No GitHub Actions.** Deploys are manual SSH-based and
run directly against the Hetzner CPX42 VPS using PM2 as the process manager.

If you find a `.github/workflows/deploy.yml` describing a Docker Compose +
GitHub Actions pipeline in this repo, **it is wrong** — delete it. The real
deploy is the procedure below.

## Production environment

| Aspect                | Detail                                            |
| --------------------- | ------------------------------------------------- |
| Host                  | Hetzner CPX42 (single VPS)                        |
| Process manager       | PM2 (the `web` app + the BullMQ worker process)   |
| Reverse proxy + TLS   | Caddy (config in `docker/Caddyfile` for reference, applied directly on host) |
| Database              | Postgres on the same host                         |
| Cache / queues        | Redis on the same host                            |
| Schema deploys        | `npx prisma db push` (no migration files exist)   |

**Production database currently holds ~50,000 EV professional accounts and ~528
corporate hiring-partner accounts plus all of their job postings, applications,
messages, and threads.** There is no clean re-run. Treat every schema change as
production-risk and pre-classify it for `db push` safety (see "Schema-change
safety" below).

## Deploy procedure

Run these steps from your laptop / wherever you SSH from:

```bash
# 1. Connect
ssh deploy@<hetzner-host>

# 2. From the project directory on the server
cd /var/www/emobility-careers   # adjust to actual deploy path
git pull

# 3. Dependencies (lockfile-honest)
pnpm install --frozen-lockfile

# 4. Regenerate the Prisma client against the new schema
npx prisma generate

# 5. Apply schema changes to the LIVE DB.
#    db push (NOT migrate deploy) — diffs schema.prisma against the live DB.
#    NEVER pass --accept-data-loss; the prompt protects production from
#    a destructive change slipping through.
npx prisma db push

# 6. Fresh Next.js build (delete .next first so stale chunks are evicted)
rm -rf .next
pnpm build

# 7. The Next.js standalone output strips static + public; copy them back.
cp -R .next/static .next/standalone/.next/
cp -R public .next/standalone/

# 8. Restart everything (web + worker)
pm2 restart all

# 9. Tail logs and watch the first ~30s for boot errors
pm2 logs --lines 80
```

## Schema-change safety (mandatory pre-deploy check)

Before running `npx prisma db push` against production, classify every change
in `prisma/schema.prisma` since the last deploy:

| Class         | Examples                                                                 | What to do                                                                                       |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **SAFE**      | New model, new nullable column, new column with default, new enum, new index on a *new* (empty) table | Run `prisma db push`. Postgres 11+ stores constant defaults in catalog → no table rewrite.        |
| **RISKY**     | New NOT NULL column without default on a populated table; type change; column losing nullability; new `@unique`/`@@unique` on an existing populated column; new index on a big existing table (User / Application / JobPosting / MessageThread) | **Do NOT use `db push`.** Apply manually in stages: add nullable → backfill → constrain. For indexes, use `CREATE INDEX CONCURRENTLY` via `psql`. |
| **DESTRUCTIVE** | DROP TABLE, DROP COLUMN, any change `prisma db push` resolves by data loss | **Stop.** `db push` will prompt; never pass `--accept-data-loss`. Build a manual migration that preserves the data, or accept the data loss explicitly with the team. |

Big-table thresholds (rows where index builds start to hurt): **User > 50k,
Application > 10k, JobPosting > 5k, MessageThread > 10k.**

## Post-push raw SQL

Some things `prisma db push` can't express. Apply these manually via `psql`
on the server AFTER step 5 (and only when introduced):

| File                                                     | Purpose                                              | When to run                              |
| -------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `scripts/setup-fts.sql`                                  | Full-text search tsvector + GENERATED columns        | Once at first deploy; idempotent re-runs OK |
| `scripts/migrations/2026-05-message-thread-peer-uniq.sql` | Partial unique index on MessageThread peer threads   | Once, after the `bulkWhatsAppInvite` race is in prod |

Run them with:

```bash
# 1. Push them to the server (or git pull on the server makes them available)
# 2. Pipe into the production DB:
psql "$DATABASE_URL" -f scripts/migrations/2026-05-message-thread-peer-uniq.sql

# CONCURRENT index builds cannot run inside a transaction.
# psql with -f executes top-level statements outside a transaction by default,
# which is what we want. Do NOT wrap these in BEGIN/COMMIT.
```

## Rollback

There is no automated rollback. If a deploy goes bad:

1. `pm2 restart all` — sometimes that's all it is
2. `git revert <bad sha> && git push && repeat deploy procedure` — re-deploy
   the previous-known-good commit
3. **Schema rollbacks are the dangerous case.** `prisma db push` does not
   keep a history — if a new column went live and you `git revert` the
   schema, the next `db push` will see the column as "extra" and prompt to
   drop it (data loss). Either keep the column for the rollback window or
   manually drop it with explicit `ALTER TABLE ... DROP COLUMN` once data is
   migrated off it.

## Why no CI/CD

The team is small (≤3 deployers) and prefers fast manual deploys with eyes on
each step over the overhead of building a pipeline. The downside is that the
schema-safety classification above is not enforced by CI — it's a discipline
each deployer applies before running step 5. Treat the schema diff like a
checklist item, not a "Prisma will figure it out" step.
