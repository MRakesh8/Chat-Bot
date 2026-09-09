import { Router } from "express";
import { z } from "zod";
import {
  db,
  projects,
  projectIntegrations,
  integrationTools,
  crypto,
  withTenantContext,
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

// List integrations
router.get("/", async (req: any, res: any) => {
  try {
    const { projectId } = req.params;
    const orgId = req.user.organizationId;
    
    // Auth & Tenant
    const items = await withTenantContext(orgId, async (tx) => {
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
    const orgId = req.user.organizationId;
    const parsed = ConnectBody.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body" });

    const { provider, credentials, config } = parsed.data;

    // Must be a registered provider
    if (!providerRegistry.hasProvider(provider)) {
      return res.status(400).json({ error: `Provider ${provider} is not supported` });
    }

    const providerImpl = providerRegistry.getProvider(provider);
    const encryptedCredentials = crypto.encrypt(JSON.stringify(credentials));

    const result = await withTenantContext(orgId, async (tx) => {
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
          tools.map(t => ({
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
        details: { integrationId: integration.id, provider, userId: req.user.id }
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
    const orgId = req.user.organizationId;

    let credentialsObj: any = null;
    let providerName = "";

    await withTenantContext(orgId, async (tx) => {
      const integration = await tx.query.projectIntegrations.findFirst({
        where: and(
          eq(projectIntegrations.id, integrationId),
          eq(projectIntegrations.projectId, projectId)
        )
      });
      if (!integration) throw new Error("Integration not found");
      
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

    await withTenantContext(orgId, async (tx) => {
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
        details: { integrationId, provider: providerName, isValid, userId: req.user.id }
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
    const orgId = req.user.organizationId;

    // RBAC Check: Ensure user is owner/admin (assuming we have role in req.user, or we use a middleware)
    if (req.user.role === "viewer") {
      return res.status(403).json({ error: "Insufficient permissions to authorize integrations" });
    }

    const result = await withTenantContext(orgId, async (tx) => {
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
        details: { integrationId, provider: integration.provider, userId: req.user.id }
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
    const orgId = req.user.organizationId;

    if (req.user.role === "viewer") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const result = await withTenantContext(orgId, async (tx) => {
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
        details: { integrationId, provider: integration.provider, userId: req.user.id }
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
