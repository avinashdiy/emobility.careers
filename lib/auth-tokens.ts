import crypto from "node:crypto";
import { db } from "@/lib/db";

/**
 * One-time tokens for email verification + password reset.
 *
 * Pattern: we generate a random 32-byte token, send the URL-safe form to the
 * user via email, and store the SHA-256 hash in the database keyed by purpose.
 * Verification compares the hash, then atomically deletes the token (single use).
 */

export type TokenPurpose = "email-verify" | "password-reset" | "experience-verify";

const PURPOSE_TTL_MS: Record<TokenPurpose, number> = {
  "email-verify": 24 * 60 * 60 * 1000,    // 24h
  "password-reset": 1 * 60 * 60 * 1000,   // 1h
  // Experience verification — same generous 24h window as email verify;
  // the candidate is clicking from an inbox they may not check daily.
  "experience-verify": 24 * 60 * 60 * 1000,
};

function hash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function identifierFor(purpose: TokenPurpose, email: string): string {
  return `${purpose}:${email.toLowerCase()}`;
}

export interface IssuedToken {
  /** URL-safe token to email to the user — never store this. */
  token: string;
  expiresAt: Date;
}

/** Create a fresh token for an email + purpose. Invalidates any prior tokens for the same pair. */
export async function issueToken(purpose: TokenPurpose, email: string): Promise<IssuedToken> {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hash(token);
  const expiresAt = new Date(Date.now() + PURPOSE_TTL_MS[purpose]);
  const identifier = identifierFor(purpose, email);

  // Single token per (email, purpose) — replace any existing one.
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({
    data: { identifier, token: tokenHash, expires: expiresAt },
  });
  return { token, expiresAt };
}

/** Validate a token. Returns the email it was issued for, or null. Single-use: consumes on success. */
export async function consumeToken(purpose: TokenPurpose, presented: string): Promise<string | null> {
  if (!presented || presented.length < 32) return null;
  const tokenHash = hash(presented);
  const row = await db.verificationToken.findFirst({
    where: { token: tokenHash, identifier: { startsWith: `${purpose}:` } },
  });
  if (!row) return null;
  if (row.expires < new Date()) {
    await db.verificationToken.deleteMany({ where: { token: tokenHash } });
    return null;
  }
  // Single-use: delete before returning success
  await db.verificationToken.deleteMany({ where: { token: tokenHash } });
  return row.identifier.slice(`${purpose}:`.length);
}
