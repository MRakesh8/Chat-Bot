import { db, knowledgeSources } from '@workspace/db';
import { eq } from 'drizzle-orm';

async function main() {
  await db.update(knowledgeSources).set({ lastError: 'Unknown processing error' }).where(eq(knowledgeSources.lastError, '[object Object]'));
  console.log('Cleaned up legacy errors');
  process.exit(0);
}

main();
