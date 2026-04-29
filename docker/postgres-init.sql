-- Bootstrap extensions for emce dev DB.
-- pgvector image already provides the extension; we just enable it.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
