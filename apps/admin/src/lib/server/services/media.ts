// D1 and R2 share no transaction, so every write is ordered to keep one invariant: a row must
// never point at bytes that are not there. Object first on create, row first on delete.
import { media } from "@app/schema";
import type { DbClient } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError, ValidationError } from "@app/server-kit/http";
import { desc, eq, lt } from "drizzle-orm";
import type { Session } from "../auth/session";
import type { UpdateMediaInput } from "../validation/media";
import { activityLogInsert } from "./activity-log";

// `image/svg+xml` is absent on purpose: XML has no signature to check, and SVG can carry script.
// Add it only alongside sanitising or serving as an attachment.
const ALLOWED_UPLOADS = [
  { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"], signature: [0xff, 0xd8, 0xff] },
  { mimeType: "image/png", extensions: [".png"], signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/webp", extensions: [".webp"], signature: [0x52, 0x49, 0x46, 0x46], signatureAt8: [0x57, 0x45, 0x42, 0x50] },
  { mimeType: "image/avif", extensions: [".avif"], signatureAt4: [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] },
  { mimeType: "application/pdf", extensions: [".pdf"], signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
] as const;

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function matchesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

type MediaRow = typeof media.$inferSelect;

// `key` is included so a screen can build the object's URL; `uploaderId` is another table's id.
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

// The key is generated, never taken from the upload: a caller-supplied name could overwrite
// another object or escape the prefix.
export async function uploadMedia(db: DbClient, bucket: R2Bucket, file: File, session: Session) {
  const allowed = ALLOWED_UPLOADS.find((entry) => entry.mimeType === file.type);
  if (!allowed) {
    throw new ValidationError({ file: [`許可されていない形式です（${ALLOWED_UPLOADS.map((entry) => entry.mimeType).join(", ")}）。`] });
  }

  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!(allowed.extensions as readonly string[]).includes(extension)) {
    throw new ValidationError({ file: [`拡張子が形式と一致しません（${allowed.extensions.join(", ")}）。`] });
  }

  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError({ file: [`ファイルサイズは 1 バイト以上 ${MAX_UPLOAD_BYTES} バイト以下にしてください。`] });
  }

  // Type and name are caller-supplied; only the bytes are not.
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signatureMatches = ("signature" in allowed ? matchesAt(header, 0, allowed.signature) : true) && ("signatureAt4" in allowed ? matchesAt(header, 4, allowed.signatureAt4) : true) && ("signatureAt8" in allowed ? matchesAt(header, 8, allowed.signatureAt8) : true);
  if (!signatureMatches) {
    throw new ValidationError({ file: ["ファイルの内容が形式と一致しません。"] });
  }

  const publicId = ulid();
  const key = `media/${publicId}`;
  // Bucket first (see the note at the top of this file).
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

  // The entry carries the key, so an object left behind by a failed bucket delete is findable.
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
