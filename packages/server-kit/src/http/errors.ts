// Thrown from Service functions, caught and converted to a Response by toErrorResponse()
// (./response.ts) at the API Route boundary.
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "認証が必要です。") {
    super(message, 401, "UNAUTHENTICATED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "権限がありません。") {
    super(message, 403, "FORBIDDEN");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "試行回数が上限を超えました。しばらく待ってからやり直してください。") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "リソースが見つかりません。") {
    super(message, 404, "NOT_FOUND");
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super(`${entity} の状態を ${from} から ${to} へ遷移できません。`, 409, "INVALID_STATE_TRANSITION");
  }
}

export class ValidationError extends AppError {
  constructor(readonly errors: Record<string, string[] | undefined>) {
    super("入力内容を確認してください。", 422, "VALIDATION_FAILED");
  }
}
