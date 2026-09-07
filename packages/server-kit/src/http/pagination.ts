// Opaque cursor for keyset pagination. The internal integer id is the cursor, so it is encoded
// rather than handed out bare alongside an API that hides row ids everywhere else.
export function encodeCursor(id: number): string {
  return btoa(JSON.stringify({ id }));
}

export function decodeCursor(cursor: string | null): number | null {
  if (!cursor) return null;
  try {
    const parsed: unknown = JSON.parse(atob(cursor));
    const id = (parsed as { id?: unknown }).id;
    return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    // A malformed cursor reads as "from the start" rather than a 500 — it is user input.
    return null;
  }
}
