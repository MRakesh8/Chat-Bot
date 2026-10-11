import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const DEV_DUMMY_KEY = "fallback_dummy_key_for_local_dev_only";

// Production guard: refuse to start with the fallback dummy key in production
if (process.env.NODE_ENV === "production") {
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === DEV_DUMMY_KEY) {
    throw new Error("A valid, secure ENCRYPTION_KEY must be set in production. Refusing to start with the development key.");
  }
}

// Compute primary encryption key buffer
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.scryptSync(process.env.ENCRYPTION_KEY, "salt", KEY_LENGTH)
  : crypto.scryptSync(DEV_DUMMY_KEY, "salt", KEY_LENGTH);

export function encrypt(text: string): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === DEV_DUMMY_KEY)) {
    throw new Error("A valid, secure ENCRYPTION_KEY must be set in production. Refusing to encrypt with the development key.");
  }

  const keyBuffer = process.env.ENCRYPTION_KEY
    ? crypto.scryptSync(process.env.ENCRYPTION_KEY, "salt", KEY_LENGTH)
    : ENCRYPTION_KEY;

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedData
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function tryDecryptWithBuffer(encryptedData: string, authTag: Buffer, iv: Buffer, keyBuffer: Buffer): string | null {
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return null;
  }
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  
  const parts = encryptedText.split(":");
  // If it doesn't match the IV:AuthTag:Data format, assume it's a legacy unencrypted key
  if (parts.length !== 3) {
    return encryptedText;
  }
  
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedData = parts[2];

  const isProd = process.env.NODE_ENV === "production";
  const primarySecret = process.env.ENCRYPTION_KEY;

  // 1. Attempt decryption with primary ENCRYPTION_KEY
  // In production, the hardcoded fallback dummy key is NEVER permitted as primary key.
  if (primarySecret && (!isProd || primarySecret !== DEV_DUMMY_KEY)) {
    const primaryKeyBuffer = crypto.scryptSync(primarySecret, "salt", KEY_LENGTH);
    const primaryDecrypted = tryDecryptWithBuffer(encryptedData, authTag, iv, primaryKeyBuffer);
    if (primaryDecrypted !== null) {
      return primaryDecrypted;
    }
  } else if (!isProd && !primarySecret) {
    // In non-production without ENCRYPTION_KEY, attempt the module-level default
    const primaryDecrypted = tryDecryptWithBuffer(encryptedData, authTag, iv, ENCRYPTION_KEY);
    if (primaryDecrypted !== null) {
      return primaryDecrypted;
    }
  }

  // 2. If OLD_ENCRYPTION_KEY is explicitly provided in the environment, attempt it
  const oldSecret = process.env.OLD_ENCRYPTION_KEY;
  if (oldSecret && typeof oldSecret === "string" && oldSecret.trim().length > 0) {
    const oldKeyBuffer = crypto.scryptSync(oldSecret, "salt", KEY_LENGTH);
    const oldDecrypted = tryDecryptWithBuffer(encryptedData, authTag, iv, oldKeyBuffer);
    if (oldDecrypted !== null) {
      return oldDecrypted;
    }
  }

  // 3. In non-production environments ONLY, attempt fallback dummy key (for local dev / seed records).
  // Production strictly prohibits any silent fallback to the hardcoded development key.
  if (!isProd && primarySecret !== DEV_DUMMY_KEY) {
    const fallbackBuffer = crypto.scryptSync(DEV_DUMMY_KEY, "salt", KEY_LENGTH);
    const fallbackDecrypted = tryDecryptWithBuffer(encryptedData, authTag, iv, fallbackBuffer);
    if (fallbackDecrypted !== null) {
      return fallbackDecrypted;
    }
  }

  // Only log if all authorized key attempts failed to decrypt (rate-limited per ciphertext fingerprint)
  logDecryptionWarning(encryptedData.slice(0, 16));
  return "";
}

// In-memory rate-limiter for decryption warnings to avoid log flooding
const warnedCiphertexts = new Map<string, number>();
const DECRYPTION_WARN_INTERVAL_MS = 60000;

function logDecryptionWarning(fingerprint: string) {
  const now = Date.now();
  const lastWarn = warnedCiphertexts.get(fingerprint) || 0;
  if (now - lastWarn >= DECRYPTION_WARN_INTERVAL_MS) {
    warnedCiphertexts.set(fingerprint, now);
    if (warnedCiphertexts.size > 200) {
      for (const [k, ts] of warnedCiphertexts.entries()) {
        if (now - ts >= DECRYPTION_WARN_INTERVAL_MS) warnedCiphertexts.delete(k);
      }
    }
    console.warn("Warning: Could not decrypt API key (possibly due to changed ENCRYPTION_KEY). Marking as invalid.");
  }
}
