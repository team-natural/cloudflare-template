import { AppError, ValidationError } from "./errors";

export function jsonItem(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
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
