import { AppError, NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

/** Catch-all handler that converts unknown routes into a 404 response. */
export function notFoundMiddleware(req, _res, next) {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Centralized error handler. Every error thrown inside a route, controller, or
 * service ends up here and is converted into a consistent JSON error response.
 */
// eslint-disable-next-line no-unused-vars
export function errorMiddleware(err, _req, res, _next) {
  let statusCode = err instanceof AppError ? err.statusCode : 500;
  let message = err.message || "Internal Server Error";
  // Machine-readable code; resolved from the error when possible (see AppError#code).
  let code = err instanceof AppError ? err.code : null;
  let retryAfterSeconds = err.retryAfterSeconds ?? null;

  // Multer throws plain MulterError objects for upload problems.
  if (err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      code = "FILE_TOO_LARGE";
      message = `Your resume is too large. Please upload a PDF smaller than ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB.`;
    } else {
      statusCode = 400;
      code = "INVALID_FILE_TYPE";
      message = "The resume could not be uploaded. Please upload a PDF file.";
    }
  } else if (err.name === "ValidationError" && err.errors) {
    // Mongoose schema validation errors.
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
  }

  // Never leak internals: unexpected errors get a generic, user-safe message.
  if (statusCode >= 500 && !(err instanceof AppError)) {
    message = "Something went wrong. Please try again.";
  }
  if (!code) code = statusCode >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR";

  if (statusCode >= 500) {
    logger.error(`[${err.name || "Error"}] [${code}] ${err.message}`);
  } else if (statusCode === 429) {
    logger.warn(`[${code}] rate limited${retryAfterSeconds ? ` retryAfterSeconds=${retryAfterSeconds}` : ""}`);
  }

  return res.status(statusCode).json({
    success: false,
    // Legacy top-level message kept so existing consumers keep working; new
    // consumers should read `error.message` / `error.code`.
    message,
    error: {
      code,
      message,
      ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
    },
    ...(err.details && typeof err.details === "object" ? { errors: err.details } : {}),
  });
}
