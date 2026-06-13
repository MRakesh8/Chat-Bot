import { eq } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";

async function makeAdmin() {
  try {
    await db.update(users)
      .set({ role: "super_admin" })
      .where(eq(users.email, "rakesh837m@gmail.com"));
    console.log("Successfully updated rakesh837m@gmail.com to super_admin");
  } catch (error) {
    console.error("Failed to update user:", error);
  }
}

makeAdmin();
