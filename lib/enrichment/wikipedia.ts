/**
 * Wikipedia REST API fetcher — pulls a short structured summary for a
 * company. Returns null when there's no obvious Wikipedia page.
 *
 * Why Wikipedia over LinkedIn / Crunchbase:
 *   • Free, no auth, no rate-limit headaches (anon limit is 100 req/s
 *     per IP — far above what an enrichment batch needs).
 *   • Returns a clean structured payload (description + extract +
 *     thumbnail + content URLs) instead of HTML we'd have to scrape.
 *   • Coverage is excellent for OEMs + Tier-1s; thinner for Indian
 *     startups (which is fine — those use the templated about).
 *
 * Docs: https://en.wikipedia.org/api/rest_v1/#/Page%20content
 */

export interface WikipediaSummary {
  /// Page title as Wikipedia spells it (may differ from company name —
  /// e.g. "Tata Motors" instead of "Tata Motors EV").
  title: string;
  /// Short single-line "tagline" (~10 words). Useful for the
  /// description column. Wikipedia field name: `description`.
  shortDescription: string | null;
  /// First paragraph of the article (~50–200 words). Useful for the
  /// about column. Wikipedia field name: `extract`.
  extract: string;
  /// Canonical Wikipedia URL — kept in rawSources for the admin's
  /// "see original" link.
  url: string;
  /// Thumbnail URL (sometimes useful as a logo fallback when logo.dev
  /// misses, though usually it's a building photo, not a logo).
  thumbnailUrl: string | null;
}

/**
 * Fetches the Wikipedia summary for a company name. Tries several
 * title variants so we tolerate the "Tata Motors EV" vs "Tata Motors"
 * mismatch.
 *
 * Never throws — returns null on any failure (HTTP error, no page,
 * disambiguation page, parse error) so the worker can continue.
 */
export async function fetchWikipediaSummary(companyName: string): Promise<WikipediaSummary | null> {
  // Try the name as-is first, then a few common cleanups.
  const candidates = [
    companyName,
    // Strip parenthetical suffixes like "Tata Motors (EV)" → "Tata Motors"
    companyName.replace(/\s*\([^)]+\)\s*$/, "").trim(),
    // Strip trailing brand qualifiers
    companyName.replace(/\s+(EV|Inc|Inc\.|Ltd|Ltd\.|Co|Corp|Corporation|Group|Pvt Ltd|Limited|GmbH|AG|SA|SE|SpA|plc|PLC|LLC)\s*$/i, "").trim(),
  ].filter((s, i, arr) => s && arr.indexOf(s) === i); // dedup

  for (const title of candidates) {
    const result = await tryFetch(title);
    if (result) return result;
  }

  return null;
}

async function tryFetch(title: string): Promise<WikipediaSummary | null> {
  const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}?redirect=true`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        // Wikipedia asks for a meaningful User-Agent on all API calls.
        // Identifying the project + a contact URL is the polite default.
        "User-Agent": "emobility.careers/1.0 (https://emobility.careers; ev-industry recruitment platform)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.warn(`[wikipedia] fetch failed for "${title}":`, err);
    return null;
  }

  if (res.status === 404) {
    // No article with that exact title — try the next candidate.
    return null;
  }
  if (!res.ok) {
    console.warn(`[wikipedia] non-OK for "${title}": ${res.status}`);
    return null;
  }

  const data = (await res.json()) as {
    type?: string;
    title?: string;
    description?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
    thumbnail?: { source?: string };
  };

  // Skip disambiguation pages — they aren't a company summary.
  if (data.type === "disambiguation") return null;
  if (!data.extract) return null;

  return {
    title: data.title ?? title,
    shortDescription: data.description ?? null,
    extract: data.extract,
    url: data.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
    thumbnailUrl: data.thumbnail?.source ?? null,
  };
}
