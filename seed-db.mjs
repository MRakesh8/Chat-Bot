import postgres from "postgres";
import { config } from "dotenv";

config();

async function checkAndSeed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("No DATABASE_URL found.");
    return;
  }
  
  const client = postgres(connectionString);

  try {
    const res = await client`SELECT * FROM api_keys WHERE "is_system" = true;`;
    console.log("System keys found:", res.length);
    
    if (res.length === 0) {
      console.log("Seeding system key...");
      await client`
        INSERT INTO api_keys ("key_name", "api_key", "is_system", "daily_limit", "status")
        VALUES ('System Key 1', ${process.env.AI_INTEGRATIONS_GEMINI_API_KEY}, true, 20, 'healthy');
      `;
      console.log("System key seeded.");
    } else {
      // Just check if it has the env key
      const hasKey = res.some((r) => r.api_key === process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
      if (!hasKey) {
        console.log("Seeding secondary system key...");
        await client`
          INSERT INTO api_keys ("key_name", "api_key", "is_system", "daily_limit", "status")
          VALUES ('System Key 2', ${process.env.AI_INTEGRATIONS_GEMINI_API_KEY}, true, 20, 'healthy');
        `;
        console.log("Secondary system key seeded.");
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

checkAndSeed();
