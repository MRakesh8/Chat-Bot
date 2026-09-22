import { config } from "dotenv";
config({ path: "../../.env" });
import { crypto } from "@workspace/db";
console.log(crypto.encrypt(process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "test"));
