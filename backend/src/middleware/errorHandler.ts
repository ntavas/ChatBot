// errorHandler.ts
// Centralised Express error-handling middleware.
// Must be registered last in server.ts so it catches errors from all routes.

import { Request, Response, NextFunction } from "express";

/** Extended Error type that allows routes to attach an HTTP status code. */
interface HttpError extends Error {
  status?: number;
}

/**
 * Catches any error passed via next(err) and returns a consistent JSON error response.
 * Logs the full stack trace so errors are debuggable without exposing internals to clients.
 *
 * @param err - The error object, optionally with a `status` property for the HTTP code.
 * @param req - The Express request (unused but required by Express's 4-arg signature).
 * @param res - The Express response used to send the error JSON.
 * @param next - The next middleware function (unused but required by Express).
 */
export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.status ?? 500;

  console.error(`[${new Date().toISOString()}] Error ${statusCode}: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({ error: err.message ?? "An unexpected error occurred." });
}
