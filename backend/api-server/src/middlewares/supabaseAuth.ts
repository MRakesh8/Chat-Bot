import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { db, users, organizations, organizationMembers, withBypassRLS } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const supabaseUrl = process.env.SUPABASE_URL || "";
// Use the service role key on the backend for server-side token verification.
// The anon key is for client-side use only and will cause getUser() to fail
// with 401 when used in a server-to-server context.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const LOCAL_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const supabaseAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const p = req.path;

  // Root endpoints, health checks, non-API routes, public share routes, demo project, and webhooks do not require Supabase authentication
  if (
    p === "/" ||
    p === "/health" ||
    p === "/healthz" ||
    p === "/favicon.ico" ||
    p === "/api" ||
    p === "/api/healthz" ||
    p.startsWith("/api/health") ||
    !p.startsWith("/api") ||
    p.startsWith("/api/projects/share/") ||
    p.includes("/projects/demo") ||
    p.includes("/projects/00000000-0000-4000-8000-000000000000") ||
    p.includes("/agent/capabilities/00000000-0000-4000-8000-000000000000") ||
    p.includes("/agent/capabilities/demo") ||
    p === "/api/payments/razorpay/webhook"
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    if (process.env.LOCAL_DEMO_MODE === "true") {
      try {
        await withBypassRLS(async (tx: any) => {
          await tx
            .insert(users)
            .values({ id: LOCAL_DEMO_USER_ID, email: "local-demo@example.com" })
            .onConflictDoNothing();
        });

        // Ensure organization and membership for demo user
        let memberships = await withBypassRLS(async (tx: any) => {
          return await tx.select()
            .from(organizationMembers)
            .where(eq(organizationMembers.userId, LOCAL_DEMO_USER_ID));
        });

        if (memberships.length === 0) {
          const [newOrg] = await withBypassRLS(async (tx: any) => {
            return await tx.insert(organizations).values({
              name: "Demo Workspace",
              planId: "00000000-0000-0000-0000-000000000001",
              subscriptionStatus: "active"
            }).returning();
          });

          await withBypassRLS(async (tx: any) => {
            await tx.insert(organizationMembers).values({
              organizationId: newOrg.id,
              userId: LOCAL_DEMO_USER_ID,
              role: "owner"
            });
          });

          memberships.push({
            organizationId: newOrg.id,
            userId: LOCAL_DEMO_USER_ID,
            role: "owner"
          } as any);
        }

        (req as any).auth = { 
          userId: LOCAL_DEMO_USER_ID,
          dbUser: {
            id: LOCAL_DEMO_USER_ID,
            email: "local-demo@example.com",
            role: "user",
            features: {
              canCreateProject: true,
              canUseWidgetStudio: true,
              canUseContextEngine: true,
            }
          },
          memberships: memberships.map((m: any) => ({
            organizationId: m.organizationId,
            role: m.role
          }))
        };
      } catch (err) {
        logger.error(err, "Failed to ensure local demo user");
        res.status(500).json({ error: "Failed to initialize local demo user session" });
        return;
      }
      return next();
    }
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (
    (process.env.LOCAL_DEMO_MODE === "true" || process.env.NODE_ENV !== "production") &&
    (token === "local-demo-token" || token === "test-token")
  ) {
    try {
      await withBypassRLS(async (tx: any) => {
        await tx
          .insert(users)
          .values({ id: LOCAL_DEMO_USER_ID, email: "local-demo@example.com" })
          .onConflictDoNothing();
      });

      let memberships = await withBypassRLS(async (tx: any) => {
        return await tx.select()
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, LOCAL_DEMO_USER_ID));
      });

      if (memberships.length === 0) {
        const [newOrg] = await withBypassRLS(async (tx: any) => {
          return await tx.insert(organizations).values({
            name: "Demo Workspace",
            planId: "00000000-0000-0000-0000-000000000001",
            subscriptionStatus: "active"
          }).returning();
        });

        await withBypassRLS(async (tx: any) => {
          await tx.insert(organizationMembers).values({
            organizationId: newOrg.id,
            userId: LOCAL_DEMO_USER_ID,
            role: "owner"
          });
        });

        memberships.push({
          organizationId: newOrg.id,
          userId: LOCAL_DEMO_USER_ID,
          role: "owner"
        } as any);
      }

      (req as any).auth = { 
        userId: LOCAL_DEMO_USER_ID,
        dbUser: {
          id: LOCAL_DEMO_USER_ID,
          email: "local-demo@example.com",
          role: "user",
          features: {
            canCreateProject: true,
            canUseWidgetStudio: true,
            canUseContextEngine: true,
          }
        },
        memberships: memberships.map((m: any) => ({
          organizationId: m.organizationId,
          role: m.role
        }))
      };
      return next();
    } catch (err) {
      logger.error(err, "Failed to initialize demo user");
      res.status(500).json({ error: "Failed to initialize demo user session" });
      return;
    }
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  let dbUser;
  try {
    const email = data.user.email || "no-email@example.com";

    // 1. Look up existing user by email (using withBypassRLS for auth context initialization)
    const existingUser = await withBypassRLS(async (tx: any) => {
      return await tx.select().from(users).where(eq(users.email, email)).limit(1);
    });

    if (existingUser.length === 0) {
      // User doesn't exist locally, insert them
      const inserted = await withBypassRLS(async (tx: any) => {
        return await tx.insert(users).values({
          id: data.user.id, // Use Supabase ID
          email,
          role: "user",
        }).returning();
      });
      dbUser = inserted[0];
    } else {
      dbUser = existingUser[0];
    }

    // 2. Set mappedUserId to this user's DB ID
    let mappedUserId = dbUser.id;

    // 3. Fetch memberships for user (using withBypassRLS to bypass zero-row RLS filter during auth resolution)
    let memberships = await withBypassRLS(async (tx: any) => {
      return await tx.select()
        .from(organizationMembers)
        .where(eq(organizationMembers.userId, mappedUserId));
    });

    if (memberships.length === 0) {
      const [newOrg] = await withBypassRLS(async (tx: any) => {
        return await tx.insert(organizations).values({
          name: `${email.split("@")[0]}'s Workspace`,
          planId: "00000000-0000-0000-0000-000000000001",
          subscriptionStatus: "active"
        }).returning();
      });

      await withBypassRLS(async (tx: any) => {
        await tx.insert(organizationMembers).values({
          organizationId: newOrg.id,
          userId: mappedUserId,
          role: "owner"
        });
      });

      memberships.push({
        organizationId: newOrg.id,
        userId: mappedUserId,
        role: "owner"
      } as any);
    }

    (req as any).auth = { 
      userId: mappedUserId, 
      user: data.user, 
      dbUser,
      memberships: memberships.map((m: any) => ({
        organizationId: m.organizationId,
        role: m.role
      }))
    };
  } catch (err) {
    logger.error(err, "Failed to upsert user");
    res.status(500).json({ error: "Failed to initialize user session" });
    return;
  }

  next();
};
