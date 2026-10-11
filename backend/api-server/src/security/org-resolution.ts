import { isDemoProjectId, getDemoProjectMeta } from "../services/demo-project";
import { db, withTenantContext, withBypassRLS, projects } from "@workspace/db";
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

  // Fast single-query lookup via bypass RLS followed by strict membership/ownership authorization
  const project = await withBypassRLS(async (tx: any) => {
    const [p] = await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return p;
  });

  if (!project) return null;

  const projectOrgId = project.organizationId;
  const isMember = Boolean(projectOrgId && candidateOrgIds.includes(projectOrgId));
  const isOwner = Boolean(project.userId && project.userId === auth.userId);

  if (isSuperAdmin || isMember || isOwner) {
    return { project, authoritativeOrgId: projectOrgId || candidateOrgIds[0] };
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


