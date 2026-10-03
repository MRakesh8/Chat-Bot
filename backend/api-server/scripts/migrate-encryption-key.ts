import crypto from "crypto";
import { db, withBypassRLS } from "@workspace/db";
import { userApiKeys, projectApiKeys, projectIntegrations, browserCapabilities, whatsappConnections } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "salt", KEY_LENGTH);
}

function encryptWithKey(text: string, keyBuffer: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptWithKey(encryptedText: string, keyBuffer: Buffer): string {
  if (!encryptedText) return "";
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    return encryptedText; // legacy plaintext
  }
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedData = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function migrateEncryptionKeys(oldSecret: string, newSecret: string, dryRun = false) {
  if (!oldSecret || !newSecret) {
    throw new Error("Both oldSecret and newSecret must be non-empty strings.");
  }
  if (oldSecret === newSecret) {
    throw new Error("newSecret must be different from oldSecret.");
  }

  const oldKeyBuffer = deriveKey(oldSecret);
  const newKeyBuffer = deriveKey(newSecret);

  console.log(`[MIGRATION] Starting credential migration (dryRun: ${dryRun})...`);

  let totalMigrated = 0;
  let userKeysMigrated = 0;
  let projectKeysMigrated = 0;
  let integrationsMigrated = 0;

  await withBypassRLS(async (tx) => {
    // 1. user_api_keys
    const users = await tx.select().from(userApiKeys);
    for (const u of users) {
      if (!u.encryptedKey) continue;
      const plaintext = decryptWithKey(u.encryptedKey, oldKeyBuffer);
      if (!plaintext) {
        throw new Error(`Failed to decrypt user_api_key record ID: ${u.id} with old key.`);
      }
      const newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      const testDecrypted = decryptWithKey(newEncrypted, newKeyBuffer);
      if (testDecrypted !== plaintext) {
        throw new Error(`Round-trip verification failed for user_api_key ID: ${u.id}`);
      }
      if (!dryRun) {
        await tx.update(userApiKeys).set({ encryptedKey: newEncrypted }).where(eq(userApiKeys.id, u.id));
      }
      userKeysMigrated++;
      totalMigrated++;
    }

    // 2. project_api_keys (includes 3 encrypted + 3 legacy plaintext)
    const projects = await tx.select().from(projectApiKeys);
    for (const p of projects) {
      if (!p.encryptedKey) continue;
      const is3Part = p.encryptedKey.split(":").length === 3;
      const plaintext = is3Part
        ? decryptWithKey(p.encryptedKey, oldKeyBuffer)
        : p.encryptedKey; // legacy plaintext

      if (!plaintext) {
        throw new Error(`Failed to extract plaintext for project_api_key record ID: ${p.id}.`);
      }
      const newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      const testDecrypted = decryptWithKey(newEncrypted, newKeyBuffer);
      if (testDecrypted !== plaintext) {
        throw new Error(`Round-trip verification failed for project_api_key ID: ${p.id}`);
      }
      if (!dryRun) {
        await tx.update(projectApiKeys).set({ encryptedKey: newEncrypted }).where(eq(projectApiKeys.id, p.id));
      }
      projectKeysMigrated++;
      totalMigrated++;
    }

    // 3. project_integrations
    const ints = await tx.select().from(projectIntegrations);
    for (const i of ints) {
      if (!i.encryptedCredentials) continue;
      const plaintext = decryptWithKey(i.encryptedCredentials, oldKeyBuffer);
      if (!plaintext) {
        throw new Error(`Failed to decrypt project_integrations record ID: ${i.id} with old key.`);
      }
      const newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      const testDecrypted = decryptWithKey(newEncrypted, newKeyBuffer);
      if (testDecrypted !== plaintext) {
        throw new Error(`Round-trip verification failed for project_integrations ID: ${i.id}`);
      }
      if (!dryRun) {
        await tx.update(projectIntegrations).set({ encryptedCredentials: newEncrypted }).where(eq(projectIntegrations.id, i.id));
      }
      integrationsMigrated++;
      totalMigrated++;
    }

    // 4. browser_capabilities & whatsapp_connections (check if any)
    const browsers = await tx.select().from(browserCapabilities);
    for (const b of browsers) {
      if (!b.encryptedAuthDetails) continue;
      const plaintext = decryptWithKey(b.encryptedAuthDetails, oldKeyBuffer);
      const newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      if (!dryRun) {
        await tx.update(browserCapabilities).set({ encryptedAuthDetails: newEncrypted }).where(eq(browserCapabilities.id, b.id));
      }
      totalMigrated++;
    }

    const whatsapps = await tx.select().from(whatsappConnections);
    for (const w of whatsapps) {
      if (!w.encryptedCredentials) continue;
      const plaintext = decryptWithKey(w.encryptedCredentials, oldKeyBuffer);
      const newEncrypted = encryptWithKey(plaintext, newKeyBuffer);
      if (!dryRun) {
        await tx.update(whatsappConnections).set({ encryptedCredentials: newEncrypted }).where(eq(whatsappConnections.id, w.id));
      }
      totalMigrated++;
    }

    if (dryRun) {
      throw new Error("DRY_RUN_ROLLBACK"); // Abort transaction intentionally for dry runs
    }
  }).catch((err) => {
    if (dryRun && err.message === "DRY_RUN_ROLLBACK") {
      console.log("[MIGRATION] Dry run complete. All records successfully verified. Changes rolled back as requested.");
      return;
    }
    throw err;
  });

  console.log(`[MIGRATION] Success! Total records migrated: ${totalMigrated}`);
  console.log(`  - user_api_keys: ${userKeysMigrated}`);
  console.log(`  - project_api_keys: ${projectKeysMigrated} (including legacy plaintext keys)`);
  console.log(`  - project_integrations: ${integrationsMigrated}`);

  return {
    totalMigrated,
    userKeysMigrated,
    projectKeysMigrated,
    integrationsMigrated,
  };
}

// CLI runner
if (process.argv[1]?.includes("migrate-encryption-key")) {
  const oldSecret = process.env.OLD_ENCRYPTION_KEY || "fallback_dummy_key_for_local_dev_only";
  const newSecret = process.env.NEW_ENCRYPTION_KEY;
  const isDryRun = process.argv.includes("--dry-run");

  if (!newSecret) {
    console.error("ERROR: NEW_ENCRYPTION_KEY environment variable is required.");
    process.exit(1);
  }

  migrateEncryptionKeys(oldSecret, newSecret, isDryRun)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exit(1);
    });
}
