import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { db, users, organizations, organizationMembers } from "@workspace/db";
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
  // Public share routes do not require authentication
  if (req.path.startsWith("/api/projects/share/")) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    if (process.env.LOCAL_DEMO_MODE === "true") {
      try {
        await db
          .insert(users)
          .values({ id: LOCAL_DEMO_USER_ID, email: "local-demo@example.com" })
          .onConflictDoNothing();

        // Ensure organization and membership for demo user
        let memberships = await db.select()
          .from(organizationMembers)
          .where(eq(organizationMembers.userId, LOCAL_DEMO_USER_ID));

        if (memberships.length === 0) {
          const [newOrg] = await db.insert(organizations).values({
            name: "Demo Workspace",
            planId: "00000000-0000-0000-0000-000000000001",
            subscriptionStatus: "active"
          }).returning();

          await db.insert(organizationMembers).values({
            organizationId: newOrg.id,
            userId: LOCAL_DEMO_USER_ID,
            role: "owner"
          });

          memberships.push({
            organizationId: newOrg.id,
            userId: LOCAL_DEMO_USER_ID,
            role: "owner"
          } as any);
        }

        (req as any).auth = { 
          userId: LOCAL_DEMO_USER_ID,
          memberships: memberships.map(m => ({
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

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  let dbUser;
  try {
    const email = data.user.email || "no-email@example.com";
    const coOwnerEmails = ["rakesh837m@gmail.com", "rakesh0837m@gmail.com"];

    // 1. Look up existing user by email (since email is unique)
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (existingUser.length === 0) {
      // User doesn't exist locally, insert them
      const role = coOwnerEmails.includes(email) ? "super_admin" : "user";
      const inserted = await db.insert(users).values({
        id: data.user.id, // Use Supabase ID
        email,
        role,
      }).returning();
      dbUser = inserted[0];
    } else {
      dbUser = existingUser[0];
      // Sync role if they are one of the co-owners and not already super_admin
      if (coOwnerEmails.includes(email) && dbUser.role !== "super_admin") {
        const [updated] = await db.update(users)
          .set({ role: "super_admin" })
          .where(eq(users.id, dbUser.id))
          .returning();
        dbUser = updated;
      }
    }

    // 2. Set mappedUserId to this user's DB ID
    let mappedUserId = dbUser.id;

    // 3. If the logged in user is rakesh0837m@gmail.com, they map to rakesh837m@gmail.com's DB ID
    if (email === "rakesh0837m@gmail.com") {
      let targetUser = await db.select().from(users).where(eq(users.email, "rakesh837m@gmail.com")).limit(1);
      if (targetUser.length === 0) {
        // Create placeholder user for rakesh837m@gmail.com
        const [inserted] = await db.insert(users).values({
          email: "rakesh837m@gmail.com",
          role: "super_admin",
        }).returning();
        mappedUserId = inserted.id;
      } else {
        mappedUserId = targetUser[0].id;
      }
    }

    // 4. Fetch/sync memberships for user
    let memberships = await db.select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, mappedUserId));

    if (memberships.length === 0) {
      const [newOrg] = await db.insert(organizations).values({
        name: `${email.split("@")[0]}'s Workspace`,
        planId: "00000000-0000-0000-0000-000000000001",
        subscriptionStatus: "active"
      }).returning();

      await db.insert(organizationMembers).values({
        organizationId: newOrg.id,
        userId: mappedUserId,
        role: "owner"
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
      memberships: memberships.map(m => ({
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
