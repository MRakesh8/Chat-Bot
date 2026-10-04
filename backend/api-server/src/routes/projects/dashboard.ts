import { Router, Response } from "express";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { 
  projects, 
  customers, 
  chatSessions, 
  messages, 
  projectIntegrations, 
  projectEntitlements, 
  whatsappConnections,
  widgetLeads,
  widgetAnalytics,
  notifications,
  notificationSettings,
  withTenantContext
} from "@workspace/db";
import { isDemoProjectId, getDemoDashboardData, getDemoNotifications } from "../../services/demo-project";
import { resolveAuthorizedProjectOrg } from "../../security";

const router = Router({ mergeParams: true });

/**
 * GET /projects/:projectId/dashboard
 * Root aggregated dashboard data
 */
router.get("/", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoDashboardData());
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { project, authoritativeOrgId } = resolved;

    const dashboardData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      // Customers
      const [{ totalCustomers }] = await tx.select({
        totalCustomers: sql<number>`count(${customers.id})`.mapWith(Number)
      }).from(customers).where(eq(customers.projectId, projectId));

      // Conversations
      const [{ totalConversations }] = await tx.select({
        totalConversations: sql<number>`count(${chatSessions.id})`.mapWith(Number)
      }).from(chatSessions).where(eq(chatSessions.projectId, projectId));

      // AI Responses
      const [{ totalAiResponses }] = await tx.select({
        totalAiResponses: sql<number>`count(${messages.id})`.mapWith(Number)
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.projectId, projectId), eq(messages.sender, "assistant")));

      // Captured Leads
      const [{ capturedLeads }] = await tx.select({
        capturedLeads: sql<number>`count(${widgetLeads.id})`.mapWith(Number)
      }).from(widgetLeads).where(eq(widgetLeads.projectId, projectId));

      const [{ highIntentLeads }] = await tx.select({
        highIntentLeads: sql<number>`count(${widgetLeads.id})`.mapWith(Number)
      }).from(widgetLeads).where(and(eq(widgetLeads.projectId, projectId), eq(widgetLeads.score, "HIGH")));

      const totalToolExecutions = 0;

      // Usage / Quota
      const [entitlement] = await tx.select().from(projectEntitlements).where(eq(projectEntitlements.projectId, projectId));

      // Integrations
      const integrations = await tx.select().from(projectIntegrations).where(eq(projectIntegrations.projectId, projectId));

      // WhatsApp connection
      const [whatsappConnection] = await tx.select().from(whatsappConnections).where(eq(whatsappConnections.projectId, projectId));

      return {
        overview: {
          totalCustomers,
          totalConversations,
          aiResponses: totalAiResponses,
          toolExecutions: totalToolExecutions,
          capturedLeads,
          highIntentLeads
        },
        customers: {
          total: totalCustomers,
          active: totalCustomers
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
          plan: 'Pro',
          currentUsage: entitlement?.currentUsage || 0,
          quota: entitlement?.quota || 0,
          resetAt: entitlement?.resetAt
        },
        errors: []
      };
    });

    return res.json(dashboardData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching dashboard");
    return res.status(500).json({ error: "Unable to load dashboard data. Please try again." });
  }
});

/**
 * GET /projects/:projectId/dashboard/stats
 */
router.get("/stats", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    const demo = getDemoDashboardData();
    return res.json({
      totalCustomers: demo.overview.totalCustomers,
      totalConversations: demo.overview.totalConversations,
      aiResponses: demo.overview.aiResponses,
      toolExecutions: demo.overview.toolExecutions,
      capturedLeads: 18,
      highIntentLeads: 6,
      conversionRate: "5.3%",
      activeUsers: demo.customers.active
    });
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const statsData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const [{ totalCustomers }] = await tx.select({
        totalCustomers: sql<number>`count(${customers.id})`.mapWith(Number)
      }).from(customers).where(eq(customers.projectId, projectId));

      const [{ totalConversations }] = await tx.select({
        totalConversations: sql<number>`count(${chatSessions.id})`.mapWith(Number)
      }).from(chatSessions).where(eq(chatSessions.projectId, projectId));

      const [{ totalAiResponses }] = await tx.select({
        totalAiResponses: sql<number>`count(${messages.id})`.mapWith(Number)
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.projectId, projectId), eq(messages.sender, "assistant")));

      const [{ capturedLeads }] = await tx.select({
        capturedLeads: sql<number>`count(${widgetLeads.id})`.mapWith(Number)
      }).from(widgetLeads).where(eq(widgetLeads.projectId, projectId));

      const [{ highIntentLeads }] = await tx.select({
        highIntentLeads: sql<number>`count(${widgetLeads.id})`.mapWith(Number)
      }).from(widgetLeads).where(and(eq(widgetLeads.projectId, projectId), eq(widgetLeads.score, "HIGH")));

      const convRate = totalConversations > 0 ? ((capturedLeads / totalConversations) * 100).toFixed(1) + "%" : "0.0%";

      return {
        totalCustomers,
        totalConversations,
        aiResponses: totalAiResponses,
        toolExecutions: 0,
        capturedLeads,
        highIntentLeads,
        conversionRate: convRate,
        activeUsers: totalCustomers
      };
    });

    return res.json(statsData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching dashboard stats");
    return res.status(500).json({ error: "Unable to load dashboard stats. Please try again." });
  }
});

/**
 * GET /projects/:projectId/dashboard/revenue-chart
 */
router.get("/revenue-chart", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  const timeframe = (req.query.timeframe as string) || "7d";

  if (isDemoProjectId(projectId)) {
    return res.json([
      { date: "Day 1", revenue: 420, conversations: 28, messages: 64 },
      { date: "Day 2", revenue: 680, conversations: 34, messages: 82 },
      { date: "Day 3", revenue: 510, conversations: 31, messages: 75 },
      { date: "Day 4", revenue: 890, conversations: 45, messages: 110 },
      { date: "Day 5", revenue: 1050, conversations: 52, messages: 130 },
      { date: "Day 6", revenue: 980, conversations: 48, messages: 118 },
      { date: "Day 7", revenue: 1240, conversations: 61, messages: 145 }
    ]);
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const chartData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      let daysCount = 7;
      if (timeframe === "24h") daysCount = 1;
      else if (timeframe === "30d") daysCount = 30;

      const startDate = new Date();
      startDate.setUTCHours(0, 0, 0, 0);
      startDate.setDate(startDate.getDate() - (daysCount - 1));

      const rows = await tx.select()
        .from(widgetAnalytics)
        .where(and(eq(widgetAnalytics.projectId, projectId), gte(widgetAnalytics.date, startDate)));

      const dailyMap = new Map<string, any>();
      for (const row of rows) {
        const isoDate = new Date(row.date).toISOString().split('T')[0];
        dailyMap.set(isoDate, row);
      }

      const result = [];
      const now = new Date();
      now.setUTCHours(0, 0, 0, 0);

      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const isoDate = d.toISOString().split('T')[0];
        const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const row = dailyMap.get(isoDate);

        const dayConversations = row ? row.conversations : 0;
        const dayMessages = row ? row.messages : 0;
        const estimatedRevenue = dayConversations * 15; // Estimated value generated per conversation

        result.push({
          date: dateLabel,
          rawDate: isoDate,
          revenue: estimatedRevenue,
          conversations: dayConversations,
          messages: dayMessages
        });
      }

      return result;
    });

    return res.json(chartData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching revenue-chart");
    return res.status(500).json({ error: "Unable to load revenue chart. Please try again." });
  }
});

/**
 * GET /projects/:projectId/dashboard/pipeline
 */
router.get("/pipeline", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;

  if (isDemoProjectId(projectId)) {
    return res.json([
      { stage: "New Lead", count: 8, value: 2400 },
      { stage: "Contacted", count: 5, value: 1500 },
      { stage: "Qualified", count: 3, value: 1200 },
      { stage: "Converted", count: 2, value: 800 }
    ]);
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const pipelineData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const leads = await tx.select().from(widgetLeads).where(eq(widgetLeads.projectId, projectId));

      const counts: Record<string, number> = {
        NEW: 0,
        CONTACTED: 0,
        QUALIFIED: 0,
        CONVERTED: 0
      };

      for (const lead of leads) {
        const st = (lead.status || "NEW").toUpperCase();
        if (counts[st] !== undefined) counts[st]++;
        else counts.NEW++;
      }

      return [
        { stage: "New Lead", count: counts.NEW, value: counts.NEW * 300 },
        { stage: "Contacted", count: counts.CONTACTED, value: counts.CONTACTED * 300 },
        { stage: "Qualified", count: counts.QUALIFIED, value: counts.QUALIFIED * 400 },
        { stage: "Converted", count: counts.CONVERTED, value: counts.CONVERTED * 500 }
      ];
    });

    return res.json(pipelineData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching pipeline data");
    return res.status(500).json({ error: "Unable to load pipeline data. Please try again." });
  }
});

/**
 * GET /projects/:projectId/dashboard/activity
 */
router.get("/activity", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;

  if (isDemoProjectId(projectId)) {
    return res.json([
      { id: "demo-act-1", type: "lead", title: "New Lead Captured: Sarah Connor", detail: "sarah@cyberdyne.com", timestamp: new Date().toISOString() },
      { id: "demo-act-2", type: "message", title: "Visitor Inquiry", detail: "How does Apex Dynamics handle AI automation?", timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: "demo-act-3", type: "lead", title: "High Intent Lead: Marcus Wright", detail: "marcus@resistance.org", timestamp: new Date(Date.now() - 7200000).toISOString() }
    ]);
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const activityData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const leadsList = await tx.select()
        .from(widgetLeads)
        .where(eq(widgetLeads.projectId, projectId))
        .orderBy(desc(widgetLeads.createdAt))
        .limit(10);

      const recentMessages = await tx.select({
        content: messages.content,
        sender: messages.sender,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .innerJoin(chatSessions, eq(messages.sessionId, chatSessions.id))
      .where(and(eq(chatSessions.projectId, projectId), eq(messages.sender, "user")))
      .orderBy(desc(messages.createdAt))
      .limit(10);

      const activityItems = [];
      for (const lead of leadsList) {
        activityItems.push({
          id: `lead-${lead.id}`,
          type: "lead",
          title: `Lead Captured: ${lead.name || lead.email || "Visitor"}`,
          detail: [lead.email, lead.phone, lead.company].filter(Boolean).join(" • ") || "Contact info saved",
          timestamp: lead.createdAt ? new Date(lead.createdAt).toISOString() : new Date().toISOString()
        });
      }

      for (const msg of recentMessages) {
        activityItems.push({
          id: `msg-${Math.random().toString(36).substring(7)}`,
          type: "message",
          title: "Incoming Visitor Query",
          detail: msg.content.length > 60 ? msg.content.substring(0, 60) + "..." : msg.content,
          timestamp: msg.createdAt ? new Date(msg.createdAt).toISOString() : new Date().toISOString()
        });
      }

      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return activityItems.slice(0, 15);
    });

    return res.json(activityData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching activity data");
    return res.status(500).json({ error: "Unable to load activity feed. Please try again." });
  }
});

/**
 * GET /projects/:projectId/dashboard/notifications
 */
router.get("/notifications", async (req: any, res: Response): Promise<any> => {
  const { projectId } = req.params;
  if (isDemoProjectId(projectId)) {
    return res.json(getDemoNotifications());
  }

  let rawOrgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(rawOrgId)) rawOrgId = rawOrgId[0];

  try {
    const resolved = await resolveAuthorizedProjectOrg(req, projectId, rawOrgId);
    if (!resolved) {
      if (!req.auth) return res.status(401).json({ error: "Unauthorized" });
      return res.status(403).json({ error: "Forbidden: You are not a member of this workspace" });
    }

    const { authoritativeOrgId } = resolved;

    const notifData = await withTenantContext(authoritativeOrgId, async (tx: any) => {
      const notifs = await tx.select()
        .from(notifications)
        .where(eq(notifications.projectId, projectId))
        .orderBy(desc(notifications.createdAt))
        .limit(50);
        
      const [settings] = await tx.select().from(notificationSettings).where(eq(notificationSettings.projectId, projectId));
      
      return { 
        notifications: notifs, 
        settings: settings || { notifyOnDislikes: 3, notifyOnLikes: 3, enabled: true } 
      };
    });

    return res.json(notifData);
  } catch (error: any) {
    req.log.error({ error, projectId }, "Error fetching notifications");
    return res.status(500).json({ error: "Unable to load notifications. Please try again." });
  }
});

export default router;
