import { Router, Response } from "express";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { 
  projects, 
  customers, 
  chatSessions, 
  messages, 
  projectIntegrations, 
  projectEntitlements, 
  apiLogs,
  whatsappConnections,
  withTenantContext,
  db
} from "@workspace/db";
import { isDemoProjectId, getDemoDashboardData } from "../../services/demo-project";

const router = Router({ mergeParams: true });

const ROLE_WEIGHTS: Record<string, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  agent: 2,
  viewer: 1,
};

function hasRequiredRole(userRole: string, requiredRole: "owner" | "admin" | "manager" | "agent" | "viewer"): boolean {
  return (ROLE_WEIGHTS[userRole] || 0) >= ROLE_WEIGHTS[requiredRole];
}

router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoDashboardData());
  }
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  const timeframe = (req.query.timeframe as string) || "7d";

  if (!orgId || Array.isArray(orgId)) {
    return res.status(400).json({ error: "Invalid organization ID" });
  }

  // CRITICAL SECURITY: Verify the user is actually a member of this organization
  const auth = req.auth;
  if (!auth) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const isSuperAdmin = auth.dbUser?.role === "super_admin";
  const membership = auth.memberships?.find((m: any) => m.organizationId === orgId);
  
  if (!isSuperAdmin && !membership) {
    return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
  }

  const isWorkspaceAdmin = isSuperAdmin || (membership && hasRequiredRole(membership.role, "manager"));

  try {
    const dashboardData = await withTenantContext(orgId as string, async (tx: any) => {
      // 1. Verify project exists and belongs to the tenant
      const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
      
      if (!project) {
        throw new Error("Project not found");
      }

      // 2. Enforce Project-level RBAC: non-admins can only see projects they created
      if (!isWorkspaceAdmin && project.userId !== auth.userId) {
        throw new Error("Forbidden");
      }

      // Customers
      const [{ totalCustomers }] = await tx.select({
        totalCustomers: sql<number>`count(${customers.id})`.mapWith(Number)
      }).from(customers).where(eq(customers.projectId, projectId));

      // Conversations
      const [{ totalConversations }] = await tx.select({
        totalConversations: sql<number>`count(${chatSessions.id})`.mapWith(Number)
      }).from(chatSessions).where(eq(chatSessions.projectId, projectId));

      // AI Responses (from messages where sender is assistant)
      const [{ totalAiResponses }] = await tx.select({
        totalAiResponses: sql<number>`count(${messages.id})`.mapWith(Number)
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.projectId, projectId), eq(messages.sender, "assistant")));

      // Tool Executions (mocked to 0 since toolCalls doesn't exist on messages)
      const totalToolExecutions = 0;

      // Usage / Quota
      const [entitlement] = await tx.select().from(projectEntitlements).where(eq(projectEntitlements.projectId, projectId));

      // Integrations
      const integrations = await tx.select().from(projectIntegrations).where(eq(projectIntegrations.projectId, projectId));

      // WhatsApp status
      const [whatsappConnection] = await tx.select().from(whatsappConnections).where(eq(whatsappConnections.projectId, projectId));

      // Recent Errors (mocked to [] since systemErrors is global)
      const recentErrors: any[] = [];

      return {
        overview: {
          totalCustomers,
          totalConversations,
          aiResponses: totalAiResponses,
          toolExecutions: totalToolExecutions,
        },
        customers: {
          total: totalCustomers,
          active: totalCustomers // Placeholder
        },
        conversations: {
          total: totalConversations,
          active: 0
        },
        aiActivity: {
          responses: totalAiResponses,
        },
        toolActivity: {
          totalExecutions: totalToolExecutions,
          successfulExecutions: totalToolExecutions
        },
        integrations: integrations.map((i: any) => ({
          provider: i.provider,
          status: i.status
        })),
        website: {
          status: project?.discoveryStatus || 'Not Connected',
          url: project?.websiteUrl,
          platform: project?.platform,
          businessType: project?.businessType,
          intelligence: project?.intelligence || {}
        },
        whatsapp: {
          status: whatsappConnection ? whatsappConnection.status : 'Not connected'
        },
        usage: {
          plan: 'Pro', // placeholder
          currentUsage: entitlement?.currentUsage || 0,
          quota: entitlement?.quota || 0,
          resetAt: entitlement?.resetAt
        },
        errors: recentErrors.map((e: any) => ({
          id: e.id,
          message: e.errorMessage,
          createdAt: e.createdAt
        }))
      };
    });

    return res.json(dashboardData);
  } catch (error: any) {
    if (error.message === "Project not found") {
      return res.status(404).json({ error: "Project not found" });
    }
    if (error.message === "Forbidden") {
      return res.status(403).json({ error: "Forbidden: Insufficient privileges for this project" });
    }
    req.log.error({ error, projectId }, "Error fetching dashboard");
    return res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

export default router;
