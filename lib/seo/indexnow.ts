import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

/**
 * IndexNow — instant URL submission to Bing, Yandex, Naver, Seznam, etc.
 *
 * Spec: https://www.indexnow.org/documentation
 *
 * To enable proper auth (and avoid spam-flagging), generate a 32+ char key:
 *
 *   openssl rand -hex 16
 *
 * Set INDEXNOW_KEY in .env, and host the file at
 * `https://emobility.careers/<KEY>.txt` containing just the key string.
 * (We serve this dynamically below at the route handler level.)
 *
 * Without a key set, the ping is a no-op so dev environments don't spam.
 */
export async function pingIndexNow(urls: string | string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return;

  const list = Array.isArray(urls) ? urls : [urls];
  if (list.length === 0) return;

  const host = new URL(env.NEXT_PUBLIC_APP_URL).host;
  const body = {
    host,
    key,
    // Fixed path so it doesn't clash with the root `[username]` segment.
    keyLocation: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/api/indexnow/key`,
    urlList: list,
  };

  try {
    const res = await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "[indexnow] non-OK response");
    } else {
      logger.info({ count: list.length }, "[indexnow] submitted");
    }
  } catch (err) {
    logger.warn({ err }, "[indexnow] request failed");
  }
}

/** Google Indexing API — for JobPosting only. Requires GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY (JSON). */
export async function pingGoogleIndexing(url: string, type: "URL_UPDATED" | "URL_DELETED" = "URL_UPDATED"): Promise<void> {
  const key = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  if (!key) return;

  try {
    const credentials = JSON.parse(key);
    // Get an OAuth2 access token via JWT bearer flow
    const jwt = await import("./jwt-bearer");
    const accessToken = await jwt.getAccessToken({
      issuer: credentials.client_email,
      audience: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/indexing",
      privateKey: credentials.private_key,
    });
    const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn({ status: res.status, body: text }, "[google-indexing] non-OK response");
    } else {
      logger.info({ url, type }, "[google-indexing] submitted");
    }
  } catch (err) {
    logger.warn({ err }, "[google-indexing] failed");
  }
}
