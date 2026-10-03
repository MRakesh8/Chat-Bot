import { db, crypto } from "@workspace/db";
import { userApiKeys, projectApiKeys, projectIntegrations } from "@workspace/db/schema";
const { decrypt } = crypto;

async function testKeyDecryption() {
  console.log("=================================================================");
  console.log("  ENCRYPTION_KEY DECRYPTION & RECOVERY VERIFICATION");
  console.log("=================================================================");

  // Test 1: Verify all 17 database credentials decrypt
  const userKeys = await db.select().from(userApiKeys);
  const projKeys = await db.select().from(projectApiKeys);
  const intKeys = await db.select().from(projectIntegrations);

  let successCount = 0;
  let totalEncrypted = 0;

  for (const k of userKeys) {
    if (k.encryptedKey && k.encryptedKey.split(":").length === 3) {
      totalEncrypted++;
      const dec = decrypt(k.encryptedKey);
      if (dec && dec !== k.encryptedKey && !dec.includes(":")) {
        successCount++;
      }
    }
  }

  for (const k of projKeys) {
    if (k.encryptedKey && k.encryptedKey.split(":").length === 3) {
      totalEncrypted++;
      const dec = decrypt(k.encryptedKey);
      if (dec && dec !== k.encryptedKey && !dec.includes(":")) {
        successCount++;
      }
    }
  }

  for (const k of intKeys) {
    if (k.encryptedCredentials && k.encryptedCredentials.split(":").length === 3) {
      totalEncrypted++;
      const dec = decrypt(k.encryptedCredentials);
      if (dec && dec !== k.encryptedCredentials && !dec.includes(":")) {
        successCount++;
      }
    }
  }

  console.log(`\nTotal Encrypted Credentials in DB: ${totalEncrypted}`);
  console.log(`Successfully Decrypted: ${successCount} / ${totalEncrypted}`);

  if (successCount === totalEncrypted && totalEncrypted > 0) {
    console.log("✅ All encrypted credentials decrypt successfully!");
  } else {
    console.error("❌ Decryption mismatch on database credentials!");
  }

  process.exit(successCount === totalEncrypted ? 0 : 1);
}

testKeyDecryption().catch(console.error);
