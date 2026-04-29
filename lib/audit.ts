import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export interface AuditEntry {
  actorId?: string | null;
  action: string;        // e.g. "user.role_change", "company.verified", "skill.create"
  entity: string;        // e.g. "User", "Company", "Skill"
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/** Fire-and-forget audit log. Never throws into the caller. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        meta: entry.meta ? (entry.meta as object) : undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.warn({ err, entry }, "[audit] write failed");
  }
}
