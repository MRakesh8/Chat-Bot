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

// Compute and cache derived key buffers so heavy scryptSync is not repeated on every decrypt call
const derivedKeyCache = new Map<string, Buffer>();

export function getOrDeriveKey(secret: string): Buffer {
  let buf = derivedKeyCache.get(secret);
  if (!buf) {
    buf = crypto.scryptSync(secret, "salt", KEY_LENGTH);
    derivedKeyCache.set(secret, buf);
  }
  return buf;
}

// Compute primary encryption key buffer
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? getOrDeriveKey(process.env.ENCRYPTION_KEY)
  : getOrDeriveKey(DEV_DUMMY_KEY);

export function encrypt(text: string): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === DEV_DUMMY_KEY)) {
    throw new Error("A valid, secure ENCRYPTION_KEY must be set in production. Refusing to encrypt with the development key.");
  }

  const keyBuffer = process.env.ENCRYPTION_KEY
    ? getOrDeriveKey(process.env.ENCRYPTION_KEY)
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

function getCandidateSecrets(): string[] {
  const isProd = process.env.NODE_ENV === "production";
  const secrets: string[] = [];

  // 1. Primary ENCRYPTION_KEY
  const primarySecret = process.env.ENCRYPTION_KEY;
  if (primarySecret && (!isProd || primarySecret !== DEV_DUMMY_KEY)) {
    secrets.push(primarySecret);
  } else if (!isProd && !primarySecret) {
    secrets.push(DEV_DUMMY_KEY);
  }

  // 2. OLD_ENCRYPTION_KEY (explicit historical fallback secret)
  const oldSecret = process.env.OLD_ENCRYPTION_KEY;
  if (oldSecret && typeof oldSecret === "string" && oldSecret.trim().length > 0) {
    const trimmed = oldSecret.trim();
    if (!secrets.includes(trimmed)) {
      secrets.push(trimmed);
    }
  }

  // 3. FALLBACK_ENCRYPTION_KEYS (comma-separated list of validated historical secrets)
  const fallbackSecrets = process.env.FALLBACK_ENCRYPTION_KEYS;
  if (fallbackSecrets && typeof fallbackSecrets === "string") {
    const list = fallbackSecrets.split(",").map(s => s.trim()).filter(Boolean);
    for (const secret of list) {
      if (!isProd || secret !== DEV_DUMMY_KEY) {
        if (!secrets.includes(secret)) {
          secrets.push(secret);
        }
      }
    }
  }

  // 4. In non-production environments ONLY, attempt fallback dummy key
  if (!isProd && !secrets.includes(DEV_DUMMY_KEY)) {
    secrets.push(DEV_DUMMY_KEY);
  }

  return secrets;
}

export function canDecrypt(encryptedText: string): boolean {
  if (!encryptedText) return false;
  const parts = encryptedText.split(":");
  if (parts.length !== 3) return true; // Legacy unencrypted key
  return decrypt(encryptedText) !== "";
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

  const candidateSecrets = getCandidateSecrets();
  for (const secret of candidateSecrets) {
    const keyBuffer = getOrDeriveKey(secret);
    const decrypted = tryDecryptWithBuffer(encryptedData, authTag, iv, keyBuffer);
    if (decrypted !== null) {
      return decrypted;
    }
  }

  // Only log if all authorized key attempts failed to decrypt (rate-limited)
  logDecryptionWarning(encryptedData.slice(0, 16));
  return "";
}

// In-memory rate-limiter for decryption warnings to avoid log flooding
let lastWarnTimestamp = 0;
let suppressedWarningCount = 0;
const DECRYPTION_WARN_INTERVAL_MS = 60000;

function logDecryptionWarning(fingerprint: string) {
  const now = Date.now();
  if (now - lastWarnTimestamp >= DECRYPTION_WARN_INTERVAL_MS) {
    const additional = suppressedWarningCount > 0 ? ` (${suppressedWarningCount} additional failure(s) suppressed in interval)` : "";
    suppressedWarningCount = 0;
    lastWarnTimestamp = now;
    console.warn(`Warning: Could not decrypt API key (possibly due to changed ENCRYPTION_KEY). Check configured encryption secrets.${additional}`);
  } else {
    suppressedWarningCount++;
  }
}
