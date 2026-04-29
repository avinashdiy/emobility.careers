import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Bridge to the existing DIYguru LMS at campus.diyguru.com.
 * The endpoints below mirror the WordPress plugin's DIYguruClient
 * (see /tmp/emob-engine-v3/.../includes/Integrations/DIYguru/DIYguruClient.php).
 */

export interface DIYguruCertificate {
  studentId: string;
  fullName: string;
  email: string;
  courseName: string;
  courseSlug: string;
  completionDate: string;
  grade?: string;
  labTags?: string[];
  skillsEarned?: string[];
  capstoneProject?: {
    title: string;
    description?: string;
    url?: string;
  };
}

export class DIYguruError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.DIYGURU_API_KEY) {
    throw new DIYguruError("DIYGURU_API_KEY not configured");
  }
  const res = await fetch(`${env.DIYGURU_API_URL}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.DIYGURU_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn({ path, status: res.status, body }, "[diyguru] API call failed");
    throw new DIYguruError(`DIYguru ${path} returned ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

export async function verifyCertificate(opts: {
  studentId?: string;
  email?: string;
  certificateId?: string;
}): Promise<DIYguruCertificate | null> {
  try {
    const params = new URLSearchParams(
      Object.entries(opts).filter(([, v]) => v) as [string, string][],
    );
    const cert = await call<DIYguruCertificate>(`/certificates/verify?${params}`);
    return cert;
  } catch (err) {
    if (err instanceof DIYguruError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchGraduateRoster(opts: {
  cohort?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  cursor?: string;
}): Promise<{
  items: DIYguruCertificate[];
  nextCursor?: string;
}> {
  const params = new URLSearchParams(
    Object.entries(opts).filter(([, v]) => v != null) as [string, string][],
  );
  return call(`/graduates?${params}`);
}
