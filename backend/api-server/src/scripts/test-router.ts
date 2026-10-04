import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
import { UniversalRouterService } from "../services/ai-router";

async function main() {
  try {
    console.log("Testing UniversalRouterService.executeChat...");
    const chatRes = await UniversalRouterService.executeChat(
      {
        capabilities: { textGeneration: true },
        operation: "chat"
      },
      [{ role: "user", content: "Hi! Respond in 5 words." }]
    );
    console.log("executeChat Result:", chatRes);

    console.log("\nTesting UniversalRouterService.executeStream...");
    const stream = await UniversalRouterService.executeStream(
      {
        capabilities: { textGeneration: true, streaming: true },
        operation: "chat"
      },
      [{ role: "user", content: "Say 1, 2, 3" }]
    );
    let full = "";
    for await (const chunk of stream) {
      process.stdout.write(chunk.text);
      full += chunk.text;
    }
    console.log("\nFull stream result:", full);
    console.log("\nSUCCESS: All AI router operations passed.");
  } catch (err) {
    console.error("AI Router Test Failed:", err);
  } finally {
    process.exit(0);
  }
}

main();
