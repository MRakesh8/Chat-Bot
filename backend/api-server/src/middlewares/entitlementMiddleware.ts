import type { Request, Response, NextFunction } from "express";
import { checkProjectEntitlement } from "../security/entitlement";

/**
 * Express middleware to enforce project entitlement and subscription checks.
 * Scopes to 'projectId' or 'id' parameters and blocks requests if disabled/expired.
 */
export const entitlementMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  // 1. Resolve projectId from route context
  const projectId =
    req.params.projectId ||
    req.params.id ||
    req.body.projectId ||
    req.query.projectId ||
    (req as any).projectId;

  if (!projectId) {
    return next();
  }

  // 2. Evaluate entitlement status
  const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
  const entitlement = await checkProjectEntitlement(projectId, isSuperAdmin);

  if (!entitlement.allowed) {
    res.status(403).json({
      error: entitlement.message || "Access Denied: Entitlement restricted.",
      status: entitlement.status,
    });
    return;
  }

  // Attach entitlement status to request for use down the line
  (req as any).entitlementStatus = entitlement.status;
  next();
};
