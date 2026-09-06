import { describe, expect, it } from "vitest";
import { AppError, NotFoundError, ValidationError } from "../src/http/errors";
import { jsonItem, toErrorResponse } from "../src/http/response";

describe("jsonItem", () => {
  it("wraps the payload in a data envelope", async () => {
    const response = jsonItem({ id: "abc" }, 201);
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ data: { id: "abc" } });
  });
});

describe("toErrorResponse", () => {
  it("maps an AppError to its own status and code", async () => {
    const response = toErrorResponse(new NotFoundError());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error_code: "NOT_FOUND" });
  });

  it("includes per-field errors for a ValidationError", async () => {
    const response = toErrorResponse(new ValidationError({ email: ["required"] }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ errors: { email: ["required"] } });
  });

  it("hides an unexpected error behind a generic 500", async () => {
    const response = toErrorResponse(new Error("connection string: postgres://user:pw@host"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { message: string };
    expect(body.message).not.toContain("postgres://");
  });

  it("returns a 5xx AppError verbatim, so its message must stay client-safe", async () => {
    const response = toErrorResponse(new AppError("upstream timeout", 503, "UPSTREAM_TIMEOUT"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ message: "upstream timeout", error_code: "UPSTREAM_TIMEOUT" });
  });
});
