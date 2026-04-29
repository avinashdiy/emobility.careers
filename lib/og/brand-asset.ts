import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline brand assets as data URLs for use inside `next/og` ImageResponse.
 *
 * `<img src="/brand/icon.png">` does not work inside ImageResponse because
 * the renderer runs without HTTP fetch context — relative URLs resolve to
 * nothing. Absolute URLs work but pin the OG renderer to your prod
 * domain, which breaks staging + previews. Reading the bytes off disk
 * once and inlining them is the most reliable path: same image at every
 * environment, zero-network OG generation.
 *
 * Cached at module-eval time — these are 30-50KB each, not worth refetching.
 */

const BRAND_DIR = join(process.cwd(), "public", "brand");

let _iconDataUrl: string | null = null;
let _logoDataUrl: string | null = null;

export function brandIconDataUrl(): string {
  if (!_iconDataUrl) {
    const buf = readFileSync(join(BRAND_DIR, "icon.png"));
    _iconDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return _iconDataUrl;
}

export function brandLogoDataUrl(): string {
  if (!_logoDataUrl) {
    const buf = readFileSync(join(BRAND_DIR, "logo.png"));
    _logoDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  }
  return _logoDataUrl;
}
