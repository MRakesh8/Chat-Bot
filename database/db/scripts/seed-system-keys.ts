import { db, apiKeys } from "../src/index";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from the backend root
dotenv.config({ path: path.resolve(__dirname, "../../../backend/.env") });

async function seedSystemKeys() {
  console.log("Seeding system keys...");
  
  const systemKeys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY // Fallback
  ].filter(Boolean) as string[];

  if (systemKeys.length === 0) {
    console.warn("No GEMINI_API_KEY_* found in environment. Using fallback free key for system.");
    systemKeys.push("YOUR_FREE_GEMINI_API_KEY");
  }

  // Deduplicate keys just in case
  const uniqueKeys = Array.from(new Set(systemKeys));

  for (let i = 0; i < uniqueKeys.length; i++) {
    const key = uniqueKeys[i];
    
    // Check if key already exists as system key
    const existing = await db.query.apiKeys.findFirst({
      where: (table, { eq, and, isNull }) => and(isNull(table.userId), eq(table.apiKey, key))
    });

    if (!existing) {
      await db.insert(apiKeys).values({
        keyName: `System Key ${i + 1}`,
        apiKey: key,
        isSystem: true,
        dailyLimit: 20, // System limit per requirements
        status: "healthy",
      });
      console.log(`Inserted System Key ${i + 1}`);
    } else {
      console.log(`System Key ${i + 1} already exists.`);
    }
  }

  console.log("System keys seeded successfully.");
  process.exit(0);
}

seedSystemKeys().catch(err => {
  console.error("Failed to seed system keys:", err);
  process.exit(1);
});
