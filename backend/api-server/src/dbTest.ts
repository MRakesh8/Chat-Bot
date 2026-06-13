import { db, userApiKeys } from "@workspace/db";
async function run() {
  const keys = await db.select().from(userApiKeys);
  console.log("Found keys:", keys.length);
  console.log(keys);
  process.exit(0);
}
run();
