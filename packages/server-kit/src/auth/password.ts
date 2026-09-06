// Password hashing: Web Crypto PBKDF2, zero dependencies. Native Node addons
// (`@node-rs/argon2` etc.) don't run in the Workers runtime.
import { fromBase64Url, toBase64Url } from "./encoding";

// OWASP's current PBKDF2-HMAC-SHA256 minimum is 600,000 iterations (~50ms measured here),
// comfortably inside the Workers Paid plan's CPU budget. The Free plan's 10ms limit can't
// fit this at any secure iteration count, so password auth here assumes a paid Worker.
const ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

async function deriveBits(password: string, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" }, keyMaterial, KEY_LENGTH_BITS);
}

// Constant-time comparison — a plain `===`/loop-with-early-return on the derived hash would
// leak timing information about how many leading bytes matched.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// Stored format: "<base64url salt>.<base64url hash>" — no external library needed to parse it.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await deriveBits(password, salt);
  return `${toBase64Url(salt)}.${toBase64Url(new Uint8Array(hash))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltPart, hashPart] = stored.split(".");
  if (!saltPart || !hashPart) return false;

  const salt = fromBase64Url(saltPart);
  const expected = fromBase64Url(hashPart);
  const actual = new Uint8Array(await deriveBits(password, salt));
  return timingSafeEqual(actual, expected);
}

// Callers that would otherwise skip verifyPassword (unknown email, deactivated account) must
// still pay one derivation, or the iteration cost becomes a user-enumeration oracle: "no such
// account" would answer instantly while a real one takes ~50ms. The stored value is a fixed
// dummy in the same format, so nothing can ever match it.
const DUMMY_STORED_HASH = `${toBase64Url(new Uint8Array(SALT_LENGTH_BYTES))}.${toBase64Url(new Uint8Array(KEY_LENGTH_BITS / 8))}`;

export async function burnPasswordVerification(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_STORED_HASH);
}
