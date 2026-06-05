import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
const LOCAL_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  try {
    const existingUser = await db.select().from(users).where(eq(users.id, data.user.id));
    if (existingUser.length === 0) {
      await db.insert(users).values({
        id: data.user.id,
        email: data.user.email || "no-email@example.com",
      });
    }
  } catch (err) {
    console.error("Failed to upsert user:", err);
  }

  (req as any).auth = { userId: data.user.id, user: data.user };
  next();
};
