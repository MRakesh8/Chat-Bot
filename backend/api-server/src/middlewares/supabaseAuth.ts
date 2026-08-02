import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

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
      } catch (err) {
        console.error("Failed to ensure local demo user:", err);
        res.status(500).json({ error: "Failed to initialize local demo user session" });
        return;
      }
      (req as any).auth = { userId: LOCAL_DEMO_USER_ID };
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
    const existingUser = await db.select().from(users).where(eq(users.id, data.user.id));
    if (existingUser.length === 0) {
      const inserted = await db.insert(users).values({
        id: data.user.id,
        email: data.user.email || "no-email@example.com",
      }).returning();
      dbUser = inserted[0];
    } else {
      dbUser = existingUser[0];
    }
  } catch (err) {
    console.error("Failed to upsert user:", err);
    res.status(500).json({ error: "Failed to initialize user session" });
    return;
  }

  (req as any).auth = { userId: data.user.id, user: data.user, dbUser };
  next();
};
