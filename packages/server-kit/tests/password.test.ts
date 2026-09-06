import { describe, expect, it } from "vitest";
import { burnPasswordVerification, hashPassword, verifyPassword } from "../src/auth/password";

describe("hashPassword", () => {
  it("produces a salt.hash pair that verifies", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(stored.split(".")).toHaveLength(2);
    await expect(verifyPassword("correct horse battery staple", stored)).resolves.toBe(true);
  });

  it("salts each call, so the same password never yields the same string", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("rejects a wrong password", async () => {
    const stored = await hashPassword("right");
    await expect(verifyPassword("wrong", stored)).resolves.toBe(false);
  });

  it("returns false instead of throwing on a malformed stored value", async () => {
    // A row hand-edited in D1 must not turn into a 500 that the login route reports differently
    // from a normal failure.
    for (const stored of ["", "no-separator", ".", "salt.", ".hash"]) {
      await expect(verifyPassword("any", stored)).resolves.toBe(false);
    }
  });
});

describe("burnPasswordVerification", () => {
  it("costs a real derivation, so a miss cannot be timed apart from a hit", async () => {
    const stored = await hashPassword("password");

    const burnStart = performance.now();
    await burnPasswordVerification("password");
    const burn = performance.now() - burnStart;

    const verifyStart = performance.now();
    await verifyPassword("password", stored);
    const verify = performance.now() - verifyStart;

    // Loose bound: this asserts the derivation is not skipped, not that timing is identical.
    expect(burn).toBeGreaterThan(verify / 4);
  });
});
