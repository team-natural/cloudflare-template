// Reference Service implementation. Three things here are conventions, not preferences: the
// internal integer id never leaves this layer, status only moves through transitionInquiry, and
// an audit entry shares the transaction with the change it records.
//
// No create — a visitor writes those from apps/public. No update either: the message is theirs.
import { inquiries } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { InvalidStateTransitionError, NotFoundError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { Session } from "../auth/session";
import { activityLogInsert } from "./activity-log";

export type InquiryStatus = "new" | "in_progress" | "resolved";

const TRANSITIONS: Record<InquiryStatus, InquiryStatus[]> = {
  new: ["in_progress"],
  in_progress: ["resolved", "new"],
  resolved: ["in_progress"],
};

export function allowedTransitions(status: InquiryStatus): InquiryStatus[] {
  return TRANSITIONS[status] ?? [];
}

type InquiryRow = typeof inquiries.$inferSelect;

// `id` and `handled_by` are internal integers. Re-expose an FK only as the referenced row's
// public key, and only when a screen needs it.
export function toPublicInquiry(row: InquiryRow) {
  return {
    id: row.publicId,
    type: row.type,
    name: row.name,
    email: row.email,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

// Newest first — the only order an inbox is read in — so the keyset walks the id downwards.
export async function listInquiries(db: DbClient, options: { beforeId?: number | null; perPage?: number }) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  // The extra row is the "is there another page" probe, in place of a second COUNT query.
  const rows = await db
    .select()
    .from(inquiries)
    .where(options.beforeId ? lt(inquiries.id, options.beforeId) : undefined)
    .orderBy(desc(inquiries.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  // nextId stays internal; the route opaques it with encodeCursor.
  return { items: page.map(toPublicInquiry), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

// Internal: the callers below need the integer id for their WHERE clauses.
async function findInquiryRow(db: DbClient, publicId: string): Promise<InquiryRow> {
  const [row] = await db.select().from(inquiries).where(eq(inquiries.publicId, publicId)).limit(1);
  if (!row) throw new NotFoundError("お問い合わせが見つかりません。");
  return row;
}

export async function getInquiryByPublicId(db: DbClient, publicId: string) {
  return toPublicInquiry(await findInquiryRow(db, publicId));
}

export async function deleteInquiry(db: DbClient, publicId: string, session: Session): Promise<void> {
  const row = await findInquiryRow(db, publicId);
  // Logged like a transition, and with enough to identify the row once it is gone.
  await db.batch([
    db.delete(inquiries).where(eq(inquiries.id, row.id)),
    activityLogInsert(db, {
      logName: "inquiry",
      description: `Inquiry deleted (${row.status})`,
      subjectType: "Inquiry",
      subjectId: row.id,
      event: "inquiry.deleted",
      causerId: session.adminUserId,
      properties: { publicId, email: row.email },
    }),
  ]);
}

// The only writer of `status`, which is what keeps the legal moves reviewable in one place.
export async function transitionInquiry(db: DbClient, publicId: string, to: InquiryStatus, session: Session) {
  const row = await findInquiryRow(db, publicId);
  const from = row.status;

  if (!allowedTransitions(from).includes(to)) {
    throw new InvalidStateTransitionError("Inquiry", from, to);
  }

  const [updatedRows] = await db.batch([
    db
      .update(inquiries)
      .set({
        status: to,
        // Taking it on means owning it; handing it back to `new` releases it.
        handledBy: to === "in_progress" ? session.adminUserId : to === "new" ? null : row.handledBy,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(inquiries.id, row.id))
      .returning(),
    activityLogInsert(db, {
      logName: "inquiry",
      description: `Inquiry ${from} -> ${to}`,
      subjectType: "Inquiry",
      subjectId: row.id,
      event: `inquiry.${to}`,
      causerId: session.adminUserId,
      properties: { from, to },
    }),
  ]);

  return toPublicInquiry(updatedRows[0]!);
}
