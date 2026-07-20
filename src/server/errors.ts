export type AppErrorCode =
  | "CONFIGURATION_ERROR"
  | "FORBIDDEN"
  | "INFRASTRUCTURE_ERROR"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "SIZE_LIMIT_EXCEEDED"
  | "UNAUTHORIZED";

export type AppErrorStatus = 400 | 401 | 403 | 404 | 413 | 422 | 500;

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly status: AppErrorStatus,
    readonly safeMessage: string,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "AppError";
  }
}

export class ConfigurationError extends AppError {
  constructor(options?: ErrorOptions) {
    super(
      "CONFIGURATION_ERROR",
      500,
      "サーバーの認証設定が完了していません。",
      options,
    );
  }
}

export class UnauthorizedError extends AppError {
  constructor(options?: ErrorOptions) {
    super("UNAUTHORIZED", 401, "認証を確認してください。", options);
  }
}

export class ForbiddenError extends AppError {
  constructor(options?: ErrorOptions) {
    super("FORBIDDEN", 403, "この操作を実行する権限がありません。", options);
  }
}

export class ApiNotFoundError extends AppError {
  constructor(options?: ErrorOptions) {
    super("NOT_FOUND", 404, "指定されたAPIは見つかりませんでした。", options);
  }
}

export class NotFoundError extends AppError {
  constructor(options?: ErrorOptions) {
    super("NOT_FOUND", 404, "指定されたデータは見つかりませんでした。", options);
  }
}

export class InvalidRequestError extends AppError {
  constructor(message = "入力内容を確認してください。", options?: ErrorOptions) {
    super("INVALID_REQUEST", 400, message, options);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(options?: ErrorOptions) {
    super(
      "SIZE_LIMIT_EXCEEDED",
      413,
      "アップロードできるサイズまたはファイル数の上限を超えています。",
      options,
    );
  }
}

export class UnprocessableRequestError extends AppError {
  constructor(options?: ErrorOptions) {
    super(
      "INVALID_REQUEST",
      422,
      "アップロード内容を読み取れませんでした。",
      options,
    );
  }
}

export class InfrastructureError extends AppError {
  constructor(options?: ErrorOptions) {
    super(
      "INFRASTRUCTURE_ERROR",
      500,
      "処理を完了できませんでした。時間をおいて再試行してください。",
      options,
    );
  }
}
