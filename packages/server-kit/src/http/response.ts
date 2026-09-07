import { AppError, ValidationError } from "./errors";

export function jsonItem(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

// Keyset pagination, not offset: an admin list is append-heavy, and OFFSET re-scans the rows it
// skips. `next_cursor` is null on the last page.
export function jsonCursorCollection(data: unknown[], meta: { perPage: number; nextCursor: string | null }): Response {
  return Response.json({ data, meta: { per_page: meta.perPage, next_cursor: meta.nextCursor } });
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof ValidationError) {
    return Response.json({ message: error.message, errors: error.errors, error_code: error.code }, { status: error.status });
  }
  if (error instanceof AppError) {
    return Response.json({ message: error.message, error_code: error.code }, { status: error.status });
  }
  console.error(error);
  return Response.json({ message: "サーバー内部エラーが発生しました。", error_code: "INTERNAL_ERROR" }, { status: 500 });
}
