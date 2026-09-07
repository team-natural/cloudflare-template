import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../src/http/pagination";

describe("cursors", () => {
  it("round-trips an id", () => {
    expect(decodeCursor(encodeCursor(42))).toBe(42);
  });

  it("reads anything unusable as the first page rather than throwing", () => {
    // The cursor is a query parameter, so every one of these is reachable from a browser bar.
    for (const cursor of [null, "", "not-base64", btoa("not json"), btoa(JSON.stringify({})), btoa(JSON.stringify({ id: "1" })), btoa(JSON.stringify({ id: -1 })), btoa(JSON.stringify({ id: 1.5 }))]) {
      expect(decodeCursor(cursor), String(cursor)).toBeNull();
    }
  });
});
