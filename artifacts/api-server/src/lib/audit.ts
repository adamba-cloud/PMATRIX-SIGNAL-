import { db, systemAuditLogsTable } from "@workspace/db";
import { logger } from "./logger";

export type AuditSeverity = "INFO" | "WARN" | "ERROR";

export async function writeAuditLog(
  event: string,
  payload?: Record<string, unknown>,
  severity: AuditSeverity = "INFO"
): Promise<void> {
  try {
    await db.insert(systemAuditLogsTable).values({
      event,
      severity,
      payload: payload ? JSON.stringify(payload) : null,
    });
    logger.info({ event, severity, payload }, `[AUDIT] ${event}`);
  } catch (err) {
    logger.error({ err, event }, "Failed to write audit log — continuing");
  }
}
