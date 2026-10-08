import { Router } from "express";
import { z } from "zod";
import { db, withTenantContext } from "@workspace/db";
import { connectedServices } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

const CreateServiceSchema = z.object({
  provider: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  description: z.string().trim().optional(),
});

const UpdateServiceSchema = CreateServiceSchema.partial();

function getOrgId(req: any) {
  let orgId = req.headers["x-organization-id"] || req.query?.organizationId || req.body?.organizationId;
  if (Array.isArray(orgId)) orgId = orgId[0];

  if (!orgId) {
    const userMemberships = req.auth?.memberships;
    if (userMemberships && userMemberships.length > 0) {
      orgId = userMemberships[0].organizationId;
    }
  }
  return orgId;
}

function hasMembership(req: any, orgId: string) {
  const isSuperAdmin = req.auth?.dbUser?.role === "super_admin";
  const membership = req.auth?.memberships?.find((m: any) => m.organizationId === orgId);
  return isSuperAdmin || membership;
}

// GET /services
router.get("/", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const orgId = getOrgId(req);
  if (!orgId) {
    res.json([]);
    return;
  }
  
  if (!hasMembership(req, orgId)) {
    res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    return;
  }

  try {
    const services = await withTenantContext(orgId as string, async (tx: any) => {
      return await tx
        .select()
        .from(connectedServices)
        .where(eq(connectedServices.organizationId, orgId as string))
        .orderBy(connectedServices.createdAt);
    });
    res.json(services);
  } catch (err) {
    req.log.error({ err }, "Error fetching connected services");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /services
router.post("/", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "Missing organization context" });
    return;
  }
  
  if (!hasMembership(req, orgId)) {
    res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    return;
  }
  
  try {
    const parsed = CreateServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { url } = parsed.data;
    const urlObj = new URL(url);
    if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
      res.status(400).json({ error: "Invalid URL protocol. Only http/https allowed." });
      return;
    }

    const [newService] = await withTenantContext(orgId as string, async (tx: any) => {
      return await tx
        .insert(connectedServices)
        .values({
          userId,
          organizationId: orgId as string,
          provider: parsed.data.provider,
          name: parsed.data.name,
          url: parsed.data.url,
          description: parsed.data.description,
          status: "Connected",
        })
        .returning();
    });
    res.json(newService);
  } catch (err) {
    req.log.error({ err }, "Error creating connected service");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /services/:id
router.put("/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "Missing organization context" });
    return;
  }
  
  if (!hasMembership(req, orgId)) {
    res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    return;
  }
  
  try {
    const parsed = UpdateServiceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    
    if (parsed.data.url) {
      const urlObj = new URL(parsed.data.url);
      if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
        res.status(400).json({ error: "Invalid URL protocol. Only http/https allowed." });
        return;
      }
    }

    const [updated] = await withTenantContext(orgId as string, async (tx: any) => {
      return await tx
        .update(connectedServices)
        .set(parsed.data)
        .where(and(eq(connectedServices.id, req.params.id), eq(connectedServices.organizationId, orgId as string)))
        .returning();
    });

    if (!updated) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Error updating connected service");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /services/:id
router.delete("/:id", async (req, res) => {
  const userId = (req as any).auth?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const orgId = getOrgId(req);
  if (!orgId) {
    res.status(400).json({ error: "Missing organization context" });
    return;
  }
  
  if (!hasMembership(req, orgId)) {
    res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    return;
  }
  
  try {
    const [deleted] = await withTenantContext(orgId as string, async (tx: any) => {
      return await tx
        .delete(connectedServices)
        .where(and(eq(connectedServices.id, req.params.id), eq(connectedServices.organizationId, orgId as string)))
        .returning();
    });

    if (!deleted) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Error deleting connected service");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
