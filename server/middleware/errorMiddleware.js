import { AppError, NotFoundError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

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

  // Multer throws plain MulterError objects for upload problems.
  if (err.name === "MulterError") {
    statusCode = 400;
    message = `Upload error: ${err.message}`;
  } else if (err.name === "ValidationError" && err.errors) {
    // Mongoose schema validation errors.
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join("; ");
  }

  if (statusCode >= 500) {
    logger.error(`[${err.name || "Error"}] ${message}`);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.details ? { errors: err.details } : {}),
  });
}
