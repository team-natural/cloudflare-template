import { describe, expect, it } from "vitest";
import { ulid } from "../src/ulid";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
  it("is 26 Crockford base32 characters", () => {
    // I/L/O/U are excluded by the alphabet so a hand-transcribed id cannot be misread.
    expect(ulid()).toMatch(CROCKFORD);
  });

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, ulid));
    expect(ids.size).toBe(1000);
  });

  it("sorts lexicographically in creation order", async () => {
    // Every public_id is a ULID, so keyset pagination and "newest first" rely on this.
    const first = ulid();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = ulid();

    expect(first < second).toBe(true);
    expect(first.slice(0, 10) < second.slice(0, 10)).toBe(true);
  });
});
