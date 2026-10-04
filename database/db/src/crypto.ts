import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;

// Use a provided key, or fallback to a dummy key for local dev
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? crypto.scryptSync(process.env.ENCRYPTION_KEY, "salt", KEY_LENGTH)
  : crypto.scryptSync("fallback_dummy_key_for_local_dev_only", "salt", KEY_LENGTH);

// Production guard: refuse to start with the fallback dummy key in production
if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === "production") {
  throw new Error("ENCRYPTION_KEY must be set in production. Refusing to start with fallback key.");
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedData
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  
  try {
    const parts = encryptedText.split(":");
    // If it doesn't match the IV:AuthTag:Data format, assume it's a legacy unencrypted key
    if (parts.length !== 3) {
      return encryptedText;
    }
    
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encryptedData = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (e: any) {
    // Only log if it actually looked like an encrypted string but failed to decrypt
    // (e.g., wrong ENCRYPTION_KEY)
    console.warn("Warning: Could not decrypt API key (possibly due to changed ENCRYPTION_KEY). Marking as invalid.");
    return "";
  }
}
