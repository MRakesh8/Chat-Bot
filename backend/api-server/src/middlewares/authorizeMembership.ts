import type { Request, Response, NextFunction } from "express";
import { db, projects, withBypassRLS } from "@workspace/db";
import { eq } from "drizzle-orm";

const ROLE_WEIGHTS: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  agent: 2,
  viewer: 1,
};

export const authorizeMembership = (requiredRole: "owner" | "admin" | "manager" | "agent" | "viewer") => {
  return async (req: Request, res: Response, next: NextFunction): Promise<any> => {
    try {
      const auth = (req as any).auth;
      if (!auth) {
        return res.status(401).json({ error: "Unauthorized: Missing authentication context" });
      }

      // Bypass for super_admin role (system support/co-owners)
      if (auth.dbUser?.role === "super_admin") {
        return next();
      }

      let organizationId = req.params.organizationId || req.query.organizationId || req.body.organizationId;

      // If project-scoped route, resolve organizationId from projectId
      const projectId = req.params.projectId || req.query.projectId || req.body.projectId;
      if (!organizationId && projectId) {
        const project = await withBypassRLS(async (tx: any) => {
          return await tx.query.projects.findFirst({
            where: eq(projects.id, projectId),
          });
        });
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        organizationId = project.organizationId;
      }

      if (!organizationId) {
        return res.status(400).json({ error: "Bad Request: Missing organization context" });
      }

      const userMembership = auth.memberships?.find(
        (m: any) => m.organizationId === organizationId
      );

      if (!userMembership) {
        return res.status(403).json({ error: "Forbidden: You are not a member of this organization" });
      }

      const userWeight = ROLE_WEIGHTS[userMembership.role] || 0;
      const requiredWeight = ROLE_WEIGHTS[requiredRole];

      if (userWeight < requiredWeight) {
        return res.status(403).json({ error: "Forbidden: Insufficient privileges inside this organization" });
      }

      // Add organizationId to request object for downstream routes
      (req as any).organizationId = organizationId;
      (req as any).membershipRole = userMembership.role;

      next();
    } catch (err) {
      next(err);
    }
  };
};
