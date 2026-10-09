import { isDemoProjectId, getDemoProjectMeta } from "../services/demo-project";
import { db, withTenantContext, projects } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function resolveAuthorizedProjectOrg(
  req: any,
  projectId: string,
  providedOrgId?: string
): Promise<{ project: any; authoritativeOrgId: string } | null> {
  if (isDemoProjectId(projectId)) {
    return {
      project: getDemoProjectMeta(),
      authoritativeOrgId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9"
    };
  }

  const auth = req.auth;
  if (!auth) return null;

  const memberships = auth.memberships || [];
  const isSuperAdmin = auth.dbUser?.role === "super_admin";

  let candidateOrgIds: string[] = memberships.map((m: any) => m.organizationId);

  // If frontend passed x-organization-id and user is a member of it, prioritize it
  if (providedOrgId && typeof providedOrgId === "string" && candidateOrgIds.includes(providedOrgId)) {
    candidateOrgIds = [providedOrgId, ...candidateOrgIds.filter((id: string) => id !== providedOrgId)];
  }

  // Superadmin bypass: if superadmin passes an orgId, allow it even if not in memberships
  if (isSuperAdmin && providedOrgId && typeof providedOrgId === "string" && !candidateOrgIds.includes(providedOrgId)) {
    candidateOrgIds.push(providedOrgId);
  }

  for (const orgId of candidateOrgIds) {
    try {
      const [project] = await withTenantContext(orgId, async (tx: any) => {
        return await tx.select().from(projects).where(
          and(eq(projects.id, projectId), eq(projects.organizationId, orgId))
        );
      });

      if (project) {
        return { project, authoritativeOrgId: orgId };
      }
    } catch (e) {
      // Ignore tenant context errors for non-matching memberships
    }
  }

  return null;
}

export async function resolveAuthorizedOrgForUser(
  req: any,
  providedOrgId?: string
): Promise<{ authoritativeOrgId: string } | null> {
  const auth = req.auth;
  if (!auth) return null;

  const memberships = auth.memberships || [];
  const isSuperAdmin = auth.dbUser?.role === "super_admin";

  let candidateOrgIds: string[] = memberships.map((m: any) => m.organizationId);

  if (providedOrgId && typeof providedOrgId === "string") {
    if (candidateOrgIds.includes(providedOrgId) || isSuperAdmin) {
      return { authoritativeOrgId: providedOrgId };
    }
  }

  if (candidateOrgIds.length > 0) {
    return { authoritativeOrgId: candidateOrgIds[0] };
  }

  return null;
}


