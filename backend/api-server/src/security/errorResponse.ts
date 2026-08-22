import type { Request, Response } from "express";
import crypto from "crypto";

export interface SafeErrorResponse {
  error: string;
  message: string;
  requestId: string;
  details?: any;
}

/**
 * Utility to extract or generate a unique request ID for logs and client responses.
 */
export function getRequestId(req: Request): string {
  if (req.id && typeof req.id === "string") {
    return req.id;
  }
  const headerId = req.headers["x-request-id"];
  if (typeof headerId === "string" && headerId) {
    return headerId;
  }
  const newId = crypto.randomUUID();
  (req as any).id = newId;
  return newId;
}

/**
 * Creates a standard safe client error response object.
 * Strips sensitive stack traces and internal errors.
 */
export function createSafeErrorResponse(
  code: string,
  message: string,
  requestId?: string,
  publicDetails?: any
): SafeErrorResponse {
  return {
    error: code,
    message,
    requestId: requestId || crypto.randomUUID(),
    ...(publicDetails ? { details: publicDetails } : {}),
  };
}

/**
 * Express response helper to send safe JSON error.
 */
export function sendSafeError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  req?: Request,
  publicDetails?: any
): Response {
  const requestId = req ? getRequestId(req) : crypto.randomUUID();
  return res.status(statusCode).json(
    createSafeErrorResponse(code, message, requestId, publicDetails)
  );
}
