// Media rows index objects in R2: the row holds the metadata, the bucket holds the bytes. There
// is no transaction across the two, so both writers order their steps to keep the same invariant
// — a row must never point at an object that is not there. An orphaned object is recoverable; a
// broken reference is what a screen renders.
import { media } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError, ValidationError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { Session } from "../auth/session";
import type { UpdateMediaInput } from "../validation/media";
import { activityLogInsert } from "./activity-log";

// An allowlist, not a denylist: the set a project actually serves is small and knowable, and
// anything outside it is a upload nobody asked for. Widen it deliberately.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/svg+xml", "application/pdf"];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type MediaRow = typeof media.$inferSelect;

// `key` is deliberately included: a screen needs it to build the object's URL. `uploaderId` is
// not — it is another table's row id.
export function toPublicMedia(row: MediaRow) {
  return {
    id: row.publicId,
    key: row.key,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    altText: row.altText,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

// Newest first, like the inquiry inbox — a media library is browsed from the most recent upload.
export async function listMedia(db: DbClient, options: { beforeId?: number | null; perPage?: number }) {
  const perPage = Math.min(Math.max(options.perPage ?? DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
  const rows = await db
    .select()
    .from(media)
    .where(options.beforeId ? lt(media.id, options.beforeId) : undefined)
    .orderBy(desc(media.id))
    .limit(perPage + 1);

  const hasMore = rows.length > perPage;
  const page = rows.slice(0, perPage);
  return { items: page.map(toPublicMedia), perPage, nextId: hasMore ? page[page.length - 1]!.id : null };
}

async function findMediaRow(db: DbClient, publicId: string): Promise<MediaRow> {
  const [row] = await db.select().from(media).where(eq(media.publicId, publicId)).limit(1);
  if (!row) throw new NotFoundError("メディアが見つかりません。");
  return row;
}

export async function getMediaByPublicId(db: DbClient, publicId: string) {
  return toPublicMedia(await findMediaRow(db, publicId));
}

// The object key is generated, never taken from the upload: a client-supplied name would let a
// caller overwrite someone else's object or write outside the intended prefix.
export async function uploadMedia(db: DbClient, bucket: R2Bucket, file: File, session: Session) {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new ValidationError({ file: [`許可されていない形式です（${ALLOWED_MIME_TYPES.join(", ")}）。`] });
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError({ file: [`ファイルサイズは 1 バイト以上 ${MAX_UPLOAD_BYTES} バイト以下にしてください。`] });
  }

  const publicId = ulid();
  const key = `media/${publicId}`;
  // Bucket first: if the row write fails the object is orphaned, which is recoverable. The other
  // order leaves a row whose object never arrived.
  await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });

  const now = new Date().toISOString();
  const [row] = await db.insert(media).values({ publicId, uploaderId: session.adminUserId, key, mimeType: file.type, sizeBytes: file.size, altText: null, updatedAt: now }).returning();
  return toPublicMedia(row!);
}

export async function updateMedia(db: DbClient, publicId: string, input: UpdateMediaInput) {
  const row = await findMediaRow(db, publicId);
  const [updated] = await db
    .update(media)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(eq(media.id, row.id))
    .returning();
  return toPublicMedia(updated!);
}

export async function deleteMedia(db: DbClient, bucket: R2Bucket, publicId: string, session: Session): Promise<void> {
  const row = await findMediaRow(db, publicId);

  // Row first, for the same reason as above. The audit entry carries the key so an object left
  // behind by a failed bucket delete can still be found.
  await db.batch([
    db.delete(media).where(eq(media.id, row.id)),
    activityLogInsert(db, {
      logName: "media",
      description: `Media deleted (${row.mimeType})`,
      subjectType: "Media",
      subjectId: row.id,
      event: "media.deleted",
      causerId: session.adminUserId,
      properties: { publicId, key: row.key },
    }),
  ]);

  await bucket.delete(row.key);
}
