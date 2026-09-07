// Reference resource tests. They pin the conventions a new resource is copied from, not the
// business meaning of an inquiry.
import { env } from "cloudflare:workers";
import { activityLog, adminUsers, inquiries } from "@app/schema";
import { createDb } from "@app/schema/client";
import { ulid } from "@app/schema/ulid";
import { InvalidStateTransitionError, NotFoundError } from "@app/server-kit/http";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Session } from "../../src/lib/server/auth/session";
import { allowedTransitions, deleteInquiry, getInquiryByPublicId, listInquiries, transitionInquiry } from "../../src/lib/server/services/inquiries";

const db = createDb(env.DB);
let session: Session;

// apps/public creates these; the admin side only ever reads and handles them.
async function arrive(n = 1) {
  const [row] = await db
    .insert(inquiries)
    .values({ publicId: ulid(), type: "general", name: `Visitor ${n}`, email: `v${n}@example.com`, message: "…", status: "new", updatedAt: new Date().toISOString() })
    .returning();
  return row!;
}

beforeEach(async () => {
  await db.delete(activityLog);
  await db.delete(inquiries);
  await db.delete(adminUsers);

  const [admin] = await db
    .insert(adminUsers)
    .values({ publicId: ulid(), name: "Editor", email: `${ulid()}@example.com`, passwordHash: "x.y", role: "editor", status: "active", updatedAt: new Date().toISOString() })
    .returning();
  session = { adminUserId: admin!.id, adminUserPublicId: admin!.publicId, role: "editor" };
});

describe("the public shape", () => {
  it("exposes public_id as `id` and hides every internal integer", async () => {
    const row = await arrive();
    const inquiry = await getInquiryByPublicId(db, row.publicId);

    expect(inquiry.id).toBe(row.publicId);
    // handledBy is another table's row id; leaking it hands out admin_users identifiers.
    expect(inquiry).not.toHaveProperty("handledBy");
    expect(Object.values(inquiry).every((value) => typeof value !== "number")).toBe(true);
  });
});

describe("listInquiries", () => {
  it("returns newest first and pages by keyset", async () => {
    for (let n = 1; n <= 3; n++) await arrive(n);

    const first = await listInquiries(db, { perPage: 2 });
    expect(first.items.map((i) => i.name)).toEqual(["Visitor 3", "Visitor 2"]);
    expect(first.nextId).not.toBeNull();

    const second = await listInquiries(db, { perPage: 2, beforeId: first.nextId });
    expect(second.items.map((i) => i.name)).toEqual(["Visitor 1"]);
    expect(second.nextId).toBeNull();
  });

  it("clamps per_page, so a client cannot ask for the whole table", async () => {
    await arrive();
    expect((await listInquiries(db, { perPage: 10_000 })).perPage).toBe(100);
    expect((await listInquiries(db, { perPage: 0 })).perPage).toBe(1);
  });
});

describe("transitions", () => {
  it("allows only the moves the state machine declares", async () => {
    expect(allowedTransitions("new")).toEqual(["in_progress"]);
    const row = await arrive();

    await expect(transitionInquiry(db, row.publicId, "resolved", session)).rejects.toBeInstanceOf(InvalidStateTransitionError);
    await expect(transitionInquiry(db, row.publicId, "in_progress", session)).resolves.toMatchObject({ status: "in_progress" });
  });

  it("assigns the handler on start and releases it on reopen", async () => {
    const row = await arrive();

    await transitionInquiry(db, row.publicId, "in_progress", session);
    const [taken] = await db.select().from(inquiries).where(eq(inquiries.id, row.id));
    expect(taken!.handledBy).toBe(session.adminUserId);

    await transitionInquiry(db, row.publicId, "new", session);
    const [released] = await db.select().from(inquiries).where(eq(inquiries.id, row.id));
    expect(released!.handledBy).toBeNull();
  });

  it("keeps the handler when resolving", async () => {
    const row = await arrive();
    await transitionInquiry(db, row.publicId, "in_progress", session);
    await transitionInquiry(db, row.publicId, "resolved", session);

    const [resolved] = await db.select().from(inquiries).where(eq(inquiries.id, row.id));
    expect(resolved!.handledBy).toBe(session.adminUserId);
  });

  it("writes an audit entry in the same transaction as the change", async () => {
    const row = await arrive();
    await transitionInquiry(db, row.publicId, "in_progress", session);

    const [entry] = await db.select().from(activityLog);
    expect(entry).toMatchObject({ event: "inquiry.in_progress", subjectType: "Inquiry", causerType: "AdminUser", causerId: session.adminUserId });
    expect(JSON.parse(entry!.properties!)).toEqual({ from: "new", to: "in_progress" });
  });

  it("leaves no audit entry when the transition is rejected", async () => {
    const row = await arrive();
    await transitionInquiry(db, row.publicId, "resolved", session).catch(() => {});

    expect(await db.select().from(activityLog)).toHaveLength(0);
  });
});

describe("deleteInquiry", () => {
  it("records what it destroyed", async () => {
    const row = await arrive();
    await deleteInquiry(db, row.publicId, session);

    expect(await db.select().from(inquiries)).toHaveLength(0);
    const [entry] = await db.select().from(activityLog);
    expect(entry).toMatchObject({ event: "inquiry.deleted", subjectId: row.id, causerId: session.adminUserId });
    // The subject row is gone, so the entry has to carry enough to identify it afterwards.
    expect(JSON.parse(entry!.properties!)).toMatchObject({ publicId: row.publicId, email: row.email });
  });
});

describe("missing rows", () => {
  it("throws NotFoundError rather than returning undefined", async () => {
    for (const call of [getInquiryByPublicId(db, "nope"), deleteInquiry(db, "nope", session), transitionInquiry(db, "nope", "in_progress", session)]) {
      await expect(call).rejects.toBeInstanceOf(NotFoundError);
    }
  });
});
