import { Router } from "express";
import { z } from "zod";
import {
  db,
  projects,
  projectIntegrations,
  integrationTools,
  crypto,
  withTenantContext,
  withBypassRLS,
  organizations,
  enterpriseAuditLogs
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { providerRegistry } from "../../services/integrations/provider-registry";
import { checkProjectEntitlement } from "../../security/entitlement";
import { logger } from "../../lib/logger";

// Register providers to ensure they are available
import "../../services/integrations/providers/shopify";

const router = Router({ mergeParams: true });

// Helper to extract auth context — mirrors projects/index.ts pattern
async function resolveAuthContext(req: any, projectId: string) {
  const userId: string | undefined = req.auth?.userId;
  if (!userId) return null;

  const isSuperAdmin = req.auth?.dbUser?.role === "super_admin";

  // Resolve project parent organization using bypass RLS
  const projectMeta = await withBypassRLS(async (tx: any) => {
    return await tx.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  });
  const project = projectMeta[0];
  if (!project) return null;

  const orgId: string = project.organizationId;
  const membership = req.auth?.memberships?.find((m: any) => m.organizationId === orgId);

  return { userId, isSuperAdmin, orgId, membership, project };
}

// List integrations
router.get("/", async (req: any, res: any) => {
  try {
    const { projectId } = req.params;

    const ctx = await resolveAuthContext(req, projectId);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });

    const { isSuperAdmin, orgId, membership } = ctx;
    if (!isSuperAdmin && !membership) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    // Auth & Tenant
    const items = await withTenantContext(orgId, async (tx: any) => {
      // Ensure project exists and belongs to org
      const proj = await tx.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.organizationId, orgId))
      });
      if (!proj) throw new Error("Project not found");

      return await tx.query.projectIntegrations.findMany({
        where: eq(projectIntegrations.projectId, projectId)
      });
    });

    // Mask credentials before sending
    const masked = items.map((item: any) => ({
      id: item.id,
      provider: item.provider,
      status: item.status,
      config: item.config,
      hasCredentials: !!item.encryptedCredentials,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    return res.json({ integrations: masked });
  } catch (error: any) {
    logger.error(error, "List integrations failed");
    return res.status(400).json({ error: error.message });
  }
});

// Connect an integration
const ConnectBody = z.object({
  provider: z.string(),
  credentials: z.any(),
  config: z.any().optional()
});

router.post("/connect", async (req: any, res: any) => {
  try {
    const { projectId } = req.params;

    const ctx = await resolveAuthContext(req, projectId);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });

    const { userId, isSuperAdmin, orgId, membership } = ctx;
    if (!isSuperAdmin && (!membership || !["owner", "admin", "manager"].includes(membership.role))) {
      return res.status(403).json({ error: "Insufficient permissions to connect integrations" });
    }

    const parsed = ConnectBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const { provider, credentials, config } = parsed.data;

    // Must be a registered provider
    if (!providerRegistry.hasProvider(provider)) {
      return res.status(400).json({ error: `Provider ${provider} is not supported` });
    }

    const providerImpl = providerRegistry.getProvider(provider);
    const encryptedCredentials = crypto.encrypt(JSON.stringify(credentials));

    const result = await withTenantContext(orgId, async (tx: any) => {
      const proj = await tx.query.projects.findFirst({
        where: and(eq(projects.id, projectId), eq(projects.organizationId, orgId))
      });
      if (!proj) throw new Error("Project not found");

      // Insert or Update integration
      const [integration] = await tx.insert(projectIntegrations).values({
        projectId,
        provider,
        status: "CONNECTED",
        encryptedCredentials,
        config: config || {}
      }).returning();

      // Seed available tools (DISCOVERED)
      const tools = providerImpl.getAvailableTools();
      if (tools.length > 0) {
        await tx.insert(integrationTools).values(
          tools.map((t: any) => ({
            integrationId: integration.id,
            projectId,
            actionName: t.actionName,
            description: t.description,
            inputSchema: t.inputSchema,
            outputSchema: t.outputSchema,
            riskLevel: t.riskLevel,
            isEnabled: true,
            status: "DISCOVERED"
          }))
        );
      }

      // Audit Log
      await tx.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "INTEGRATION_CONNECTED",
        details: { integrationId: integration.id, provider, userId }
      });

      return integration;
    });

    return res.json({ 
      id: result.id, 
      status: result.status, 
      provider: result.provider 
    });
  } catch (error: any) {
    logger.error(error, "Connect integration failed");
    return res.status(400).json({ error: error.message });
  }
});

// Verify integration
router.post("/:integrationId/verify", async (req: any, res: any) => {
  try {
    const { projectId, integrationId } = req.params;

    const ctx = await resolveAuthContext(req, projectId);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });

    const { userId, isSuperAdmin, orgId, membership } = ctx;
    if (!isSuperAdmin && (!membership || !["owner", "admin", "manager"].includes(membership.role))) {
      return res.status(403).json({ error: "Insufficient permissions to verify integrations" });
    }

    let credentialsObj: any = null;
    let providerName = "";

    await withTenantContext(orgId, async (tx: any) => {
      const integration = await tx.query.projectIntegrations.findFirst({
        where: and(
          eq(projectIntegrations.id, integrationId),
          eq(projectIntegrations.projectId, projectId)
        )
      });
      if (!integration) throw new Error("Integration not found");
      
      if (["REVOKED", "DISCONNECTED", "NOT_CONNECTED"].includes(integration.status)) {
        throw new Error(`Cannot verify integration in status: ${integration.status}. Must be CONNECTED or HEALTH_CHECK_FAILED.`);
      }

      providerName = integration.provider;
      if (integration.encryptedCredentials) {
        credentialsObj = JSON.parse(crypto.decrypt(integration.encryptedCredentials));
      }
    });

    if (!credentialsObj) {
      return res.status(400).json({ error: "No credentials found for verification" });
    }

    const providerImpl = providerRegistry.getProvider(providerName);
    const isValid = await providerImpl.verifyCredentials(credentialsObj);

    const newStatus = isValid ? "VERIFIED" : "HEALTH_CHECK_FAILED";

    await withTenantContext(orgId, async (tx: any) => {
      await tx.update(projectIntegrations)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(projectIntegrations.id, integrationId));
        
      if (isValid) {
        // Promote tools to VERIFIED
        await tx.update(integrationTools)
          .set({ status: "VERIFIED", updatedAt: new Date() })
          .where(and(
            eq(integrationTools.integrationId, integrationId),
            eq(integrationTools.status, "DISCOVERED")
          ));
      }

      await tx.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "INTEGRATION_VERIFIED",
        details: { integrationId, provider: providerName, isValid, userId }
      });
    });

    return res.json({ status: newStatus });
  } catch (error: any) {
    logger.error(error, "Verify integration failed");
    return res.status(400).json({ error: error.message });
  }
});

// Authorize integration
router.post("/:integrationId/authorize", async (req: any, res: any) => {
  try {
    const { projectId, integrationId } = req.params;

    const ctx = await resolveAuthContext(req, projectId);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });

    const { userId, isSuperAdmin, membership } = ctx;

    // RBAC Check: owner, admin, or manager required (Step 6 fix)
    if (!isSuperAdmin && (!membership || !["owner", "admin", "manager"].includes(membership.role))) {
      return res.status(403).json({ error: "Insufficient permissions to authorize integrations" });
    }

    const { orgId } = ctx;

    const result = await withTenantContext(orgId, async (tx: any) => {
      const integration = await tx.query.projectIntegrations.findFirst({
        where: and(
          eq(projectIntegrations.id, integrationId),
          eq(projectIntegrations.projectId, projectId)
        )
      });
      if (!integration) throw new Error("Integration not found");
      
      // Enforce lifecycle: MUST be VERIFIED before AUTHORIZED
      if (integration.status !== "VERIFIED") {
        throw new Error(`Cannot authorize integration in status: ${integration.status}. Must be VERIFIED first.`);
      }

      await tx.update(projectIntegrations)
        .set({ status: "AUTHORIZED", updatedAt: new Date() })
        .where(eq(projectIntegrations.id, integrationId));

      // Promote tools to EXECUTABLE
      await tx.update(integrationTools)
        .set({ status: "EXECUTABLE", updatedAt: new Date() })
        .where(and(
          eq(integrationTools.integrationId, integrationId),
          eq(integrationTools.status, "VERIFIED")
        ));

      await tx.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "INTEGRATION_AUTHORIZED",
        details: { integrationId, provider: integration.provider, userId }
      });

      return { status: "AUTHORIZED" };
    });

    return res.json(result);
  } catch (error: any) {
    logger.error(error, "Authorize integration failed");
    return res.status(400).json({ error: error.message });
  }
});

// Revoke integration
router.post("/:integrationId/revoke", async (req: any, res: any) => {
  try {
    const { projectId, integrationId } = req.params;

    const ctx = await resolveAuthContext(req, projectId);
    if (!ctx) return res.status(401).json({ error: "Unauthorized" });

    const { userId, isSuperAdmin, membership } = ctx;

    // RBAC Check: owner, admin, or manager required (Step 6 fix)
    if (!isSuperAdmin && (!membership || !["owner", "admin", "manager"].includes(membership.role))) {
      return res.status(403).json({ error: "Insufficient permissions to revoke integrations" });
    }

    const { orgId } = ctx;

    const result = await withTenantContext(orgId, async (tx: any) => {
      const integration = await tx.query.projectIntegrations.findFirst({
        where: and(
          eq(projectIntegrations.id, integrationId),
          eq(projectIntegrations.projectId, projectId)
        )
      });
      if (!integration) throw new Error("Integration not found");

      await tx.update(projectIntegrations)
        .set({ 
          status: "REVOKED", 
          encryptedCredentials: null, // Wipe credentials
          updatedAt: new Date() 
        })
        .where(eq(projectIntegrations.id, integrationId));

      await tx.update(integrationTools)
        .set({ status: "UNAVAILABLE", updatedAt: new Date() })
        .where(eq(integrationTools.integrationId, integrationId));

      await tx.insert(enterpriseAuditLogs).values({
        projectId,
        actionType: "INTEGRATION_REVOKED",
        details: { integrationId, provider: integration.provider, userId }
      });

      return { status: "REVOKED" };
    });

    return res.json(result);
  } catch (error: any) {
    logger.error(error, "Revoke integration failed");
    return res.status(400).json({ error: error.message });
  }
});

export default router;
