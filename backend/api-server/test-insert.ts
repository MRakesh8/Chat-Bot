import { db } from "@workspace/db";
import { chatSessions } from "@workspace/db";

async function test() {
  try {
    const [conversation] = await db
      .insert(chatSessions)
      .values({ title: "New Chat", projectId: null })
      .returning();
    console.log("Success:", conversation);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
