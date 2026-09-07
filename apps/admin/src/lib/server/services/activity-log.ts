// Audit log writer. Called inline from the Service function performing the change, not from a
// cross-cutting logger that would have to re-derive what counts as loggable.
import { activityLog } from "@app/schema";
import type { DbClient } from "@app/schema/client";

export interface ActivityLogEntry {
  logName?: string;
  description: string;
  subjectType?: string;
  subjectId?: number;
  event?: string;
  causerType?: string;
  // Omit for system-driven changes with no human actor — never invent a "system" AdminUser row.
  causerId?: number;
  properties?: Record<string, unknown>;
}

// Returned unexecuted so the caller can batch it with the change it describes — D1 runs a batch
// as one transaction, so the log cannot outlive a rolled-back write.
export function activityLogInsert(db: DbClient, entry: ActivityLogEntry) {
  return db.insert(activityLog).values({
    logName: entry.logName ?? null,
    description: entry.description,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    event: entry.event ?? null,
    causerType: entry.causerType ?? "AdminUser",
    causerId: entry.causerId ?? null,
    properties: entry.properties ? JSON.stringify(entry.properties) : null,
    batchId: null,
  });
}
