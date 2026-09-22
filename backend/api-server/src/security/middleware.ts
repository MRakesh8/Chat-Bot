import type { Request, Response, NextFunction } from "express";
import { db, projects, users, organizationMembers, securityAuditLogs, withBypassRLS } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendSafeError, getRequestId } from "./errorResponse";
import { sanitizeForLogging } from "./apiKey";
import { checkProjectEntitlement } from "./entitlement";

/**
 * Authentication Guard:
 * Rejects unauthenticated requests with 401.
 */
export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const auth = (req as any).auth;
  if (!auth || !auth.userId) {
    sendSafeError(
      res,
      401,
      "UNAUTHORIZED",
      "Authentication is required to access this resource.",
      req
    );
    return;
  }
  next();
}

/**
 * Server-Side Admin Role Guard:
 * Verifies user has super_admin or admin role in DB before allowing access to admin routes.
 */
export async function adminRoleGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as any).auth;
    if (!auth || !auth.userId) {
      sendSafeError(res, 401, "UNAUTHORIZED", "Authentication required.", req);
      return;
    }

    const [user] = await withBypassRLS(async (tx: any) => {
      return await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, auth.userId));
    });

    if (!user || (user.role !== "super_admin" && user.role !== "admin")) {
      logger.warn(
        { userId: auth.userId, path: req.path },
        "Unauthorized admin access attempt"
      );
      sendSafeError(
        res,
        403,
        "FORBIDDEN_ADMIN_ACCESS",
        "Administrator privileges are required for this action.",
        req
      );
      return;
    }

    (req as any).userRole = user.role;
    next();
  } catch (err) {
    logger.error({ err }, "Error in adminRoleGuard");
    sendSafeError(res, 500, "INTERNAL_ERROR", "Authorization check failed.", req);
    return;
  }
}

/**
 * Server-Side Project Ownership Guard:
 * Verifies that the authenticated user owns the target project or belongs to its organization.
 */
export function projectOwnershipGuard(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = (req as any).auth;
      if (!auth || !auth.userId) {
        sendSafeError(res, 401, "UNAUTHORIZED", "Authentication required.", req);
        return;
      }

      const projectId =
        req.params[paramName] ||
        req.body[paramName] ||
        (req.query[paramName] as string);

      if (!projectId) {
        sendSafeError(
          res,
          400,
          "INVALID_PROJECT_ID",
          "Project ID is required.",
          req
        );
        return;
      }

      // Check direct project ownership using withBypassRLS for pre-tenant-context lookup
      const [project] = await withBypassRLS(async (tx: any) => {
        return await tx
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));
      });

      if (!project) {
        sendSafeError(res, 404, "PROJECT_NOT_FOUND", "Project not found.", req);
        return;
      }

      if (project.userId === auth.userId) {
        (req as any).project = project;
        next();
        return;
      }

      // Check organization membership if project belongs to an organization
      if (project.organizationId) {
        const [member] = await withBypassRLS(async (tx: any) => {
          return await tx
            .select()
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, project.organizationId),
                eq(organizationMembers.userId, auth.userId)
              )
            );
        });

        if (member) {
          (req as any).project = project;
          next();
          return;
        }
      }

      logger.warn(
        { userId: auth.userId, projectId },
        "IDOR Access Attempt: User tried accessing unauthorized project"
      );

      sendSafeError(
        res,
        403,
        "FORBIDDEN_PROJECT_ACCESS",
        "You do not have permission to access this project.",
        req
      );
      return;
    } catch (err) {
      logger.error({ err }, "Error in projectOwnershipGuard");
      sendSafeError(
        res,
        500,
        "INTERNAL_ERROR",
        "Failed to verify project ownership.",
        req
      );
      return;
    }
  };
}

/**
 * Server-Side Entitlement Guard:
 * Verifies that the project has active entitlements (paid license or active trial).
 * Scopes to projectId resolved from route context.
 */
export function entitlementGuard(paramName = "projectId") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const projectId =
        req.params[paramName] ||
        req.body[paramName] ||
        (req.query[paramName] as string) ||
        (req as any).projectId;

      if (!projectId) {
        // If no project ID is scopeable, let it pass to next handler
        next();
        return;
      }

      const entitlement = await checkProjectEntitlement(projectId);

      if (!entitlement.allowed) {
        logger.warn(
          { projectId, status: entitlement.status },
          "Access blocked due to expired or missing entitlement"
        );
        sendSafeError(
          res,
          403,
          entitlement.status,
          entitlement.message || "Your trial or subscription has expired. Please upgrade.",
          req,
          { expiresAt: entitlement.expiresAt }
        );
        return;
      }

      (req as any).entitlementStatus = entitlement.status;
      next();
    } catch (err) {
      logger.error({ err }, "Error in entitlementGuard");
      sendSafeError(
        res,
        500,
        "INTERNAL_ERROR",
        "Failed to verify project entitlements.",
        req
      );
      return;
    }
  };
}

/**
 * Log a security audit event to DB with recursive secret sanitization.
 */
export async function logSecurityEvent(event: {
  eventName: string;
  req?: Request;
  userId?: string;
  projectId?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    const requestId = event.req ? getRequestId(event.req) : undefined;
    const ipAddress = event.req ? (event.req.ip || (event.req.headers["x-forwarded-for"] as string)) : undefined;
    const origin = event.req ? (event.req.headers.origin || event.req.headers.referer) : undefined;

    const sanitizedDetails = sanitizeForLogging(event.details || {});

    await db.insert(securityAuditLogs).values({
      event: event.eventName,
      userId: event.userId || (event.req as any)?.auth?.userId,
      projectId: event.projectId,
      requestId,
      ipAddress: typeof ipAddress === "string" ? ipAddress.slice(0, 100) : undefined,
      origin: typeof origin === "string" ? origin.slice(0, 255) : undefined,
      details: sanitizedDetails,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write security audit log");
  }
}

/**
 * Global Safe Express Error Handler Middleware
 */
export function safeErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = getRequestId(req);
  logger.error(
    {
      requestId,
      errMessage: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    },
    "Unhandled Express Error"
  );

  if (res.headersSent) {
    return;
  }

  const statusCode = err.status || err.statusCode || 500;
  const safeMessage =
    statusCode >= 500
      ? "An internal server error occurred."
      : err.message || "Invalid request.";

  sendSafeError(res, statusCode, "SERVER_ERROR", safeMessage, req);
}

/**
 * Log admin support bypass if a super_admin accesses a project outside their organization membership.
 */
export async function logAdminBypassIfNecessary(
  req: Request,
  projectId: string,
  organizationId?: string | null
): Promise<void> {
  const auth = (req as any).auth;
  if (!auth || auth.dbUser?.role !== "super_admin") return;

  if (organizationId) {
    const membership = auth.memberships?.find(
      (m: any) => m.organizationId === organizationId
    );
    if (membership) return; // Admin is a legitimate member of the workspace
  }

  await logSecurityEvent({
    eventName: "ADMIN_SUPPORT_ACCESS",
    req,
    projectId,
    details: {
      action: req.method + " " + req.originalUrl,
      reason: "Super Admin Bypassed Workspace Boundaries for Support/Audit",
    },
  });
}
