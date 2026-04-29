import crypto from "node:crypto";

/**
 * Minimal Google service-account JWT bearer flow — no extra deps.
 * Used to authenticate against the Google Indexing API for job updates.
 *
 *   const token = await getAccessToken({ issuer, audience, scope, privateKey });
 */
interface JwtOptions {
  issuer: string;
  audience: string;
  scope: string;
  privateKey: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input as string)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getAccessToken(opts: JwtOptions): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: opts.issuer,
    scope: opts.scope,
    aud: opts.audience,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = b64url(signer.sign(opts.privateKey));
  const jwt = `${header}.${claim}.${signature}`;

  const res = await fetch(opts.audience, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
