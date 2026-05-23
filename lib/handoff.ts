// ============================================================================
//  lib/handoff.ts — cross-domain SSO handoff JWT (careers side)
//
//  Mirror of academy's lib/handoff.ts. Same JWT shape, same HS256, same
//  HANDOFF_TOKEN_SECRET. Differences from the academy file:
//
//    - Default issuer = "careers"
//    - issueHandoff() targets academy by default
//    - claimNonce() uses careers' Redis client. The example below uses
//      `lib/redis.ts` (ioredis-style); adapt to whatever careers has.
//
//  Threat-model notes are in careers-patch/README.md — kept out of the
//  file body so this stays mergeable as a near-verbatim copy of the
//  academy file (diff is small enough to grok in 10 seconds).
// ============================================================================

import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

import { env } from "@/lib/env";
// Adapt to whatever Redis client careers uses. Required: SET key value NX EX <seconds>.
import { redis } from "@/lib/redis";

const HANDOFF_TTL_SECONDS = 60;
const NONCE_REDIS_TTL_SECONDS = 90;

export type HandoffSide = "academy" | "careers";

export type HandoffPayload = {
  userId: string;
  next: string;
  nonce: string;
  iss: HandoffSide;
  aud: HandoffSide;
  exp: number;
  iat: number;
};

function secretBytes(): Uint8Array {
  if (!env.HANDOFF_TOKEN_SECRET) {
    throw new Error("HANDOFF_TOKEN_SECRET is not configured.");
  }
  return new TextEncoder().encode(env.HANDOFF_TOKEN_SECRET);
}

export async function issueHandoff(opts: {
  userId: string;
  next: string;
  audience: HandoffSide;
  targetBaseUrl: string;
  issuer?: HandoffSide;
}): Promise<{ token: string; url: string; expiresAtMs: number; nonce: string }> {
  const issuer: HandoffSide = opts.issuer ?? "careers";
  const nonce = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + HANDOFF_TTL_SECONDS;

  const token = await new SignJWT({ next: opts.next, nonce })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(opts.userId)
    .setIssuer(issuer)
    .setAudience(opts.audience)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secretBytes());

  const target = new URL("/api/auth/consume-handoff", opts.targetBaseUrl);
  target.searchParams.set("token", token);
  target.searchParams.set("next", opts.next);

  return { token, url: target.toString(), expiresAtMs: exp * 1000, nonce };
}

export async function verifyHandoff(opts: {
  token: string;
  expectedAudience: HandoffSide;
  expectedIssuer: HandoffSide;
}): Promise<HandoffPayload> {
  const { payload } = await jwtVerify(opts.token, secretBytes(), {
    issuer: opts.expectedIssuer,
    audience: opts.expectedAudience,
    algorithms: ["HS256"],
  });

  const sub = payload.sub;
  const nonce = typeof payload.nonce === "string" ? payload.nonce : null;
  const next = typeof payload.next === "string" ? payload.next : null;
  const exp = typeof payload.exp === "number" ? payload.exp : null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;

  if (!sub || !nonce || !next || exp === null || iat === null) {
    throw new Error("Handoff token missing required claims");
  }
  if (!next.startsWith("/") || next.startsWith("//")) {
    throw new Error("Handoff next must be a relative path");
  }

  return {
    userId: sub,
    next,
    nonce,
    iss: payload.iss as HandoffSide,
    aud: payload.aud as HandoffSide,
    exp,
    iat,
  };
}

/**
 * Atomic single-use nonce claim. careers uses ioredis (see lib/redis.ts);
 * the positional `(key, value, "EX", seconds, "NX")` signature returns
 * "OK" on success and null when the key already exists (i.e. nonce was
 * already claimed by an earlier consume attempt — we reject as a replay).
 */
export async function claimNonce(nonce: string): Promise<boolean> {
  const ok = await redis.set(`handoff:nonce:${nonce}`, "1", "EX", NONCE_REDIS_TTL_SECONDS, "NX");
  return ok === "OK";
}
