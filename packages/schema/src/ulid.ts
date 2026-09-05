// Zero-dependency ULID (https://github.com/ulid/spec) generator. Matches DEV-01 §2's
// Web Crypto-first policy — `crypto.getRandomValues` is standard in Workers, so the `ulid`
// npm package would add a dependency for ~15 lines of encoding logic.
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 (no I/L/O/U)
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

function encodeTime(time: number): string {
  let remaining = time;
  let output = "";
  for (let i = 0; i < TIME_CHARS; i++) {
    output = ENCODING[remaining % 32] + output;
    remaining = Math.floor(remaining / 32);
  }
  return output;
}

function encodeRandom(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_CHARS));
  let output = "";
  for (const byte of bytes) {
    output += ENCODING[byte % 32];
  }
  return output;
}

export function ulid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}
