import { config } from "dotenv";
config({ path: "../../.env" });
import { crypto } from "@workspace/db";
console.log(crypto.decrypt("AQ.Ab8RN6K0ov0ByG1-PuXZg7rIa9TTSSkfQZQQSKBf9ozNkVrdeA"));
