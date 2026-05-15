import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * #16 Vernacular AI Calling Agent — provider abstraction.
 *
 * Voice-call infra lives behind a thin interface so we can swap Exotel
 * for Twilio (or any other India-friendly CPaaS) without rewriting the
 * scoring / transcript / scheduling code. Initial provider: Exotel —
 * the most-deployed Indian voice provider for B2B; supports IVR-style
 * structured calls and exposes ASR via partner integrations.
 *
 * Each provider impl is responsible for:
 *
 *   1. dialCandidate() — initiate the call, return a provider call
 *      SID we can store on CallingSession.providerCallSid.
 *
 *   2. setupWebhooks() — register the webhook endpoint for call
 *      status events. Our /api/calling/webhook/[provider] route
 *      receives those and updates the session row.
 *
 *   3. fetchRecording() — once the call ends, pull the audio + raw
 *      ASR transcript URL so we can feed it to Whisper / score it.
 *
 * The default boot is the noop provider — every method logs + returns
 * a "PROVIDER_NOT_CONFIGURED" failure. That keeps the app booting
 * without Exotel creds set; the UI surfaces the missing-config error
 * to the admin so they know what to plug in.
 */

export interface DialCandidateArgs {
  toPhoneE164: string;          // candidate phone number in E.164 format
  fromCallerId: string;         // outbound caller ID
  /// Public callback URL the provider hits with status updates. The
  /// caller passes this in so the route knows which provider's URL to
  /// register (each provider hits a slightly different endpoint).
  webhookUrl: string;
  /// Per-call metadata we want surfaced back on webhooks — usually
  /// the CallingSession id so we can correlate.
  metadata: Record<string, string>;
  /// IVR script — the structured questions the candidate hears. We
  /// translate this to provider-native TTS bytes (Exotel: passed via
  /// flow XML; Twilio: TwiML <Say>).
  script: { id: string; textInLanguage: string }[];
  /// Language code matching the CallingLanguage enum. Each provider
  /// maps these to its native voice catalog.
  languageCode: string;
}

export interface DialResult {
  ok: true;
  providerCallSid: string;
  providerName: string;
}

export interface DialFailure {
  ok: false;
  reason:
    | "PROVIDER_NOT_CONFIGURED"
    | "INVALID_NUMBER"
    | "PROVIDER_ERROR";
  detail?: string;
}

export interface CallingProvider {
  readonly name: string;
  dialCandidate(args: DialCandidateArgs): Promise<DialResult | DialFailure>;
}

// ─── Exotel implementation ──────────────────────────────────────────
//
// Exotel exposes an HTTP API at https://api.exotel.com/v1/Accounts/
// <SID>/Calls/connect.json. We POST { From, CallerId, Url, StatusCallback }
// and they respond with a Sid + Status. The IVR "flow" lives at the Url
// param — for the structured Q&A we generate a per-session Twilio-style
// XML at /api/calling/exotel/flow/[sessionId] that reads each question
// via <Say> with the candidate's language voice, then <Record>s the
// answer (or <Gather> for DTMF when we want a simple yes/no).
//
// Whole impl is gated on env vars. Missing creds → noop fallback.

class ExotelProvider implements CallingProvider {
  readonly name = "exotel";

  async dialCandidate(args: DialCandidateArgs): Promise<DialResult | DialFailure> {
    const sid = env.EXOTEL_SID;
    const token = env.EXOTEL_TOKEN;
    if (!sid || !token) {
      return { ok: false, reason: "PROVIDER_NOT_CONFIGURED", detail: "EXOTEL_SID / EXOTEL_TOKEN env vars missing" };
    }
    if (!/^\+\d{10,15}$/.test(args.toPhoneE164)) {
      return { ok: false, reason: "INVALID_NUMBER", detail: args.toPhoneE164 };
    }
    try {
      const url = `https://api.exotel.com/v1/Accounts/${encodeURIComponent(sid)}/Calls/connect.json`;
      const body = new URLSearchParams({
        From: args.toPhoneE164,
        CallerId: args.fromCallerId,
        Url: args.webhookUrl,
        StatusCallback: args.webhookUrl + "/status",
        CustomField: JSON.stringify(args.metadata),
      });
      const auth = Buffer.from(`${sid}:${token}`).toString("base64");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logger.warn({ status: res.status, detail }, "[exotel] dial failed");
        return { ok: false, reason: "PROVIDER_ERROR", detail: detail.slice(0, 500) };
      }
      const json = (await res.json()) as { Call?: { Sid?: string } };
      const providerCallSid = json?.Call?.Sid;
      if (!providerCallSid) {
        return { ok: false, reason: "PROVIDER_ERROR", detail: "Exotel response missing Call.Sid" };
      }
      return { ok: true, providerCallSid, providerName: this.name };
    } catch (err) {
      logger.error({ err }, "[exotel] dial exception");
      return { ok: false, reason: "PROVIDER_ERROR", detail: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ─── Noop provider (fallback when no creds) ─────────────────────────
class NoopProvider implements CallingProvider {
  readonly name = "noop";
  async dialCandidate(_args: DialCandidateArgs): Promise<DialResult | DialFailure> {
    return {
      ok: false,
      reason: "PROVIDER_NOT_CONFIGURED",
      detail:
        "No calling provider configured. Set EXOTEL_SID + EXOTEL_TOKEN " +
        "(and optionally EXOTEL_CALLER_ID for the outbound caller ID) " +
        "to enable the vernacular AI Calling Agent.",
    };
  }
}

/** Resolve the active provider. Centralised so tests can stub it. */
export function getCallingProvider(): CallingProvider {
  if (env.EXOTEL_SID && env.EXOTEL_TOKEN) return new ExotelProvider();
  return new NoopProvider();
}

// Re-export the language-name lookup used by the AI scoring prompt.
// Keeps the human-readable form alongside the enum so the prompt
// doesn't have to inline-translate "TA_IN" → "Tamil".
export const CALLING_LANGUAGE_NAMES: Record<string, string> = {
  EN_IN: "English (Indian)",
  HI_IN: "Hindi",
  TA_IN: "Tamil",
  TE_IN: "Telugu",
  KN_IN: "Kannada",
  MR_IN: "Marathi",
  GU_IN: "Gujarati",
  BN_IN: "Bengali",
  PA_IN: "Punjabi",
  ML_IN: "Malayalam",
};
