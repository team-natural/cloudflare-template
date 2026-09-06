// Opaque cursor for id-based keyset pagination (`?cursor=eyJpZCI6MTAwfQ`). Uses Web-standard
// btoa/atob rather than Node's Buffer — this project targets the Workers runtime, not Node.
export function encodeCursor(id: number): string {
  return btoa(JSON.stringify({ id }));
}

export function decodeCursor(cursor: string | null): number | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(atob(cursor));
    return typeof parsed.id === "number" ? parsed.id : null;
  } catch {
    return null;
  }
}
