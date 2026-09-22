import { db } from '@workspace/db';
import { projectApiKeys } from '@workspace/db/schema';
import { crypto } from '@workspace/db';
import { GoogleGenAI } from '@google/genai';

async function run() {
  const keys = await db.select().from(projectApiKeys);
  const activeKey = crypto.decrypt(keys[0].encryptedKey) || keys[0].encryptedKey;
  const directClient = new GoogleGenAI({
    apiKey: activeKey,
    httpOptions: { baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL || '' }
  });
  try {
    const res = await directClient.models.generateContent({ model: 'gemini-2.5-flash', contents: 'test' });
    console.log('2.5-flash OK', res.text);
  } catch (e) {
    console.error('1.5-flash failed', e);
  }
}
run().catch(console.error).finally(() => process.exit(0));
