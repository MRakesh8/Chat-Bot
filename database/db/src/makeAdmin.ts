import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { users } from "./schema";

async function makeAdmin() {
  try {
    const adminEmails = ["rakesh837m@gmail.com", "rakesh0837m@gmail.com"];
    await db.update(users)
      .set({ role: "super_admin" })
      .where(inArray(users.email, adminEmails));
    console.log("Successfully updated admins to super_admin:", adminEmails.join(", "));
  } catch (error) {
    console.error("Failed to update user:", error);
  }
}

makeAdmin();
