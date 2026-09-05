/**
 * Base error carrying an HTTP status code. All other application errors extend
 * this class so the centralized error middleware can map them to responses.
 *
 * The third argument doubles as a machine-readable ERROR CODE when a string is
 * passed (e.g. "AI_RATE_LIMITED", "NO_EXTRACTABLE_TEXT"). The error middleware
 * exposes it to the frontend as `error.code` so clients never have to match on
 * message text. Non-string details (e.g. field-validation maps) stay in
 * `details` and are surfaced as `errors` for form rendering.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    this.retryAfterSeconds = null; // set explicitly for 429s with a retry hint
  }

  /** Machine-readable error code (string details), or a sensible fallback. */
  get code() {
    if (typeof this.details === "string") return this.details;
    if (this.statusCode === 401) return "UNAUTHORIZED";
    if (this.statusCode === 403) return "FORBIDDEN";
    if (this.statusCode === 404) return "NOT_FOUND";
    if (this.statusCode === 429) return "RATE_LIMITED";
    if (this.statusCode === 400) return "VALIDATION_ERROR";
    if (this.statusCode >= 500) return "SERVER_ERROR";
    return "REQUEST_ERROR";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input", details = null) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Not authorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "Not implemented") {
    super(message, 501);
  }
}
