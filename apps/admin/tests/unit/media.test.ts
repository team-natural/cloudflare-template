// Media is the two-store resource: a D1 row and an R2 object that no transaction spans. What
// these pin is the ordering that keeps a row from ever pointing at bytes that are not there.
import { env } from "cloudflare:workers";
import { activityLog, adminUsers, media } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { NotFoundError, ValidationError } from "@app/server-kit/http";
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../src/lib/server/auth/session";
import { deleteMedia, getMediaByPublicId, listMedia, updateMedia, uploadMedia } from "../../src/lib/server/services/media";
import { updateMediaSchema } from "../../src/lib/server/validation/media";

const db = createDb(env.DB);
let session: Session;

const png = (name = "a.png", bytes = 4) => new File([new Uint8Array(bytes)], name, { type: "image/png" });

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(media);
  await db.delete(adminUsers);

  const [admin] = await db
    .insert(adminUsers)
    .values({ publicId: ulid(), name: "Editor", email: `${ulid()}@example.com`, passwordHash: "x.y", role: "editor", status: "active", updatedAt: new Date().toISOString() })
    .returning();
  session = { adminUserId: admin!.id, adminUserPublicId: admin!.publicId, role: "editor" };

  const { objects } = await env.BUCKET.list();
  await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)));
});

describe("uploadMedia", () => {
  it("stores the object, records the row, and returns neither internal id", async () => {
    const uploaded = await uploadMedia(db, env.BUCKET, png(), session);

    expect(uploaded.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(uploaded).not.toHaveProperty("uploaderId");
    await expect(env.BUCKET.head(uploaded.key)).resolves.not.toBeNull();
    const [row] = await db.select().from(media);
    expect(row).toMatchObject({ uploaderId: session.adminUserId, mimeType: "image/png", sizeBytes: 4 });
  });

  it("generates the object key instead of trusting the filename", async () => {
    // A caller-supplied name could overwrite another object or escape the prefix.
    const uploaded = await uploadMedia(db, env.BUCKET, png("../../etc/passwd"), session);
    expect(uploaded.key).toMatch(/^media\/[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("refuses a type outside the allowlist, and writes nothing", async () => {
    const script = new File(["boom"], "x.html", { type: "text/html" });
    await expect(uploadMedia(db, env.BUCKET, script, session)).rejects.toBeInstanceOf(ValidationError);

    expect(await db.select().from(media)).toHaveLength(0);
    expect((await env.BUCKET.list()).objects).toHaveLength(0);
  });

  it("refuses an empty or oversized file", async () => {
    await expect(uploadMedia(db, env.BUCKET, png("empty.png", 0), session)).rejects.toBeInstanceOf(ValidationError);
    await expect(uploadMedia(db, env.BUCKET, png("big.png", 10 * 1024 * 1024 + 1), session)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("updateMedia", () => {
  it("accepts alt text and nothing else", () => {
    const parsed = updateMediaSchema.parse({ altText: "A photo", key: "media/spoofed", sizeBytes: 1, uploaderId: 9 });
    expect(parsed).toEqual({ altText: "A photo" });
  });

  it("writes the alt text through", async () => {
    const uploaded = await uploadMedia(db, env.BUCKET, png(), session);
    await expect(updateMedia(db, uploaded.id, { altText: "A photo" })).resolves.toMatchObject({ altText: "A photo" });
  });
});

describe("listMedia", () => {
  it("returns newest first and pages by keyset", async () => {
    for (let n = 0; n < 3; n++) await uploadMedia(db, env.BUCKET, png(`${n}.png`), session);

    const first = await listMedia(db, { perPage: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextId).not.toBeNull();

    const second = await listMedia(db, { perPage: 2, beforeId: first.nextId });
    expect(second.items).toHaveLength(1);
    expect(second.nextId).toBeNull();
  });

  it("clamps per_page", async () => {
    await uploadMedia(db, env.BUCKET, png(), session);
    expect((await listMedia(db, { perPage: 10_000 })).perPage).toBe(100);
    expect((await listMedia(db, { perPage: 0 })).perPage).toBe(1);
  });
});

describe("deleteMedia", () => {
  it("removes both stores and records the key it removed", async () => {
    const uploaded = await uploadMedia(db, env.BUCKET, png(), session);
    await deleteMedia(db, env.BUCKET, uploaded.id, session);

    expect(await db.select().from(media)).toHaveLength(0);
    await expect(env.BUCKET.head(uploaded.key)).resolves.toBeNull();

    const [entry] = await db.select().from(activityLog);
    expect(entry).toMatchObject({ event: "media.deleted", causerId: session.adminUserId });
    // The key is what makes an object left behind by a failed bucket delete findable.
    expect(JSON.parse(entry!.properties!)).toMatchObject({ key: uploaded.key });
  });
});

describe("missing rows", () => {
  it("throws NotFoundError rather than returning undefined", async () => {
    for (const call of [getMediaByPublicId(db, "nope"), updateMedia(db, "nope", { altText: "x" }), deleteMedia(db, env.BUCKET, "nope", session)]) {
      await expect(call).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});
