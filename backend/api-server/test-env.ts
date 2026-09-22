import { config } from "dotenv";
config({ path: "../../.env" });
console.log(process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
