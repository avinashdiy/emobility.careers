-- ──────────────────────────────────────────────────────────────────────
-- Full-text search post-push migration.
--
-- Why this lives outside prisma/schema.prisma:
--   • Prisma's `db push` has no syntax for GENERATED ALWAYS AS (...)
--     STORED columns or for backfilling tsvector expressions.
--   • The Unsupported("tsvector") column declared in schema.prisma is
--     enough to keep Prisma's introspection happy, but the actual
--     GENERATED expression must be applied via raw SQL after the
--     `db push` step finishes.
--
-- Why 'simple' tokenizer (not 'english'):
--   • English stemming maps "engineering" → "engin", "batteries" →
--     "batteri", and similar — fine for English search, terrible for
--     Indian-name + brand transliterations. "Suresh" can't be the same
--     stem as "Sresh"; English stemming creates false negatives on
--     real recruiter queries we observed in Pune fair logs.
--   • 'simple' tokenizer just lowercases + splits on word boundaries
--     — perfect for proper-noun-heavy data (people, companies,
--     institutions, EV brand jargon).
--
-- Why unaccent:
--   • Indian English routinely strips/keeps diacritics inconsistently
--     ("Naïve" / "Naive", "Café" / "Cafe"). Wrapping with unaccent()
--     means typing the bare ASCII form matches the diacritic form
--     and vice-versa.
--   • The unaccent extension is enabled at DB init (see
--     docker/postgres-init.sql).
--
-- Idempotency:
--   • Every CREATE / ALTER uses IF NOT EXISTS or DO blocks that
--     check existence first. Running this script twice in a row is
--     a no-op past the first run; safe for the setup-vps.sh
--     re-deploy loop.
-- ──────────────────────────────────────────────────────────────────────

-- Belt-and-braces: ensure the extensions exist. The dev image's
-- postgres-init.sql installs these, but a managed Postgres on the
-- production VPS may not have run that init script — installing
-- here keeps the flow self-healing.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ──────────────────────────────────────────────────────────────────────
-- Per-model GENERATED expression + GIN index
--
-- Each block uses a DO block so we can guard the ALTER on
-- pg_attribute existence (ALTER TABLE … ADD COLUMN GENERATED is
-- NOT itself idempotent in Postgres; you have to wrap it).
-- ──────────────────────────────────────────────────────────────────────

-- ───── Institution ─────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Institution"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "Institution"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "Institution"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("name", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("shortName", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("city", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("state", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("about", ''))), 'C')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_institution_search_tsv"
  ON "Institution" USING GIN ("searchTsv");

-- ───── Company ─────
-- We index name (A — primary identifier), description + about (B/C),
-- hq location + tech stack (D). NOT industry/size — those are filters,
-- not search terms.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Company"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "Company"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "Company"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("name", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("description", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("about", ''))), 'C') ||
        setweight(to_tsvector('simple', unaccent(coalesce("hqLocation", ''))), 'D') ||
        -- techStack is text[]; array_to_string flattens it for the
        -- tokeniser. Empty array → empty string → no contribution.
        setweight(to_tsvector('simple', unaccent(coalesce(array_to_string("techStack", ' '), ''))), 'D')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_company_search_tsv"
  ON "Company" USING GIN ("searchTsv");

-- ───── JobPosting ─────
-- Title is the strongest signal; body second; the location array third.
-- We deliberately don't include the company name here — that gets
-- joined at query time when the search surface needs it (lets us
-- search "Tata battery engineer" by joining Company.searchTsv).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"JobPosting"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "JobPosting"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "JobPosting"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("title", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("description", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("responsibilities", ''))), 'C') ||
        setweight(to_tsvector('simple', unaccent(coalesce("requirements", ''))), 'C') ||
        setweight(to_tsvector('simple', unaccent(coalesce(array_to_string("locations", ' '), ''))), 'D')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_job_posting_search_tsv"
  ON "JobPosting" USING GIN ("searchTsv");

-- ───── CandidateProfile ─────
-- firstName + lastName concatenated as the primary tier (the typical
-- recruiter search is a person's name). Headline + institution next
-- (recruiters often search by college). Summary lowest weight (long-
-- form bio dilutes ranking if weighted higher).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"CandidateProfile"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "CandidateProfile"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "CandidateProfile"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("firstName", '') || ' ' || coalesce("lastName", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("headline", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("institution", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("location", ''))), 'C') ||
        setweight(to_tsvector('simple', unaccent(coalesce("summary", ''))), 'D')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_candidate_profile_search_tsv"
  ON "CandidateProfile" USING GIN ("searchTsv");

-- ───── Skill ─────
-- Small table (~50 rows seeded) but used heavily as autocomplete in
-- the candidate skill picker + employer JD assistant. FTS over name
-- + category gives us better partial-token ranking than ILIKE.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Skill"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "Skill"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "Skill"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("name", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("category", ''))), 'B')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_skill_search_tsv"
  ON "Skill" USING GIN ("searchTsv");

-- ───── Article ─────
-- Title is the primary identifier (SEO-critical), excerpt is the
-- short pitch the index card renders, body carries the full
-- reading content. Tags get their own array_to_string roll-up at
-- tier C — tag matches don't trump title matches but help long-tail.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = '"Article"'::regclass
      AND attname = 'searchTsv'
      AND attgenerated <> ''
  ) THEN
    ALTER TABLE "Article"
      DROP COLUMN IF EXISTS "searchTsv";
    ALTER TABLE "Article"
      ADD COLUMN "searchTsv" tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', unaccent(coalesce("title", ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce("excerpt", ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce("body", ''))), 'C') ||
        setweight(to_tsvector('simple', unaccent(coalesce(array_to_string("tags", ' '), ''))), 'C')
      ) STORED;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "idx_article_search_tsv"
  ON "Article" USING GIN ("searchTsv");

-- ───── Post.hashtags array GIN ─────
-- Not a tsvector — just a plain GIN index on the existing string
-- array column so the For-You feed's `hashtags && ARRAY[...]`
-- containment query is fast at scale. Without this, that query
-- falls back to a sequential scan over every Post and our 50ms
-- feed render budget evaporates the first time the table grows
-- past a few thousand rows. The index also speeds up trending-tag
-- aggregation in /topics.
CREATE INDEX IF NOT EXISTS "idx_post_hashtags_gin"
  ON "Post" USING GIN ("hashtags");

-- ──────────────────────────────────────────────────────────────────────
-- Notes for the future
--
-- 1. To add another model, copy a block above + replace table/column
--    names. Don't forget the GIN index — without it queries do a
--    sequential scan over the full tsvector column.
--
-- 2. To change the weight tiers or fields included in a model's
--    tsvector, the DO block's `IF NOT EXISTS` check needs flipping
--    — drop the column manually first (`ALTER TABLE … DROP COLUMN
--    "searchTsv"`) then re-run this script. We deliberately don't
--    auto-recompute on every deploy because that triggers a full
--    table rewrite and locks the table.
--
-- 3. For pg_trgm-based fuzzy matching (typo tolerance), add a
--    separate trigram index on the raw column (e.g.
--    "Company.name") and use the `%` operator. Combined with the
--    FTS index above, you get exact-token matches AND fuzzy
--    matches in one query via UNION. Out of scope for v1.
-- ──────────────────────────────────────────────────────────────────────
