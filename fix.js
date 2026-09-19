const fs = require('fs');

const path = 'd:\\Project\\Chat-bot\\backend\\integrations-gemini-ai\\src\\client.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Fix FALLBACK_MODELS
code = code.replace(
  'const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-exp"];',
  'const FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];'
);

// 2. Remove the auto-provisioning logic from _fetchAndResetKeys
const startAutoProv = code.indexOf('// Auto-provision & sync system keys from environment variables');
const endAutoProv = code.indexOf('// 3. Reset logic', startAutoProv);

if (startAutoProv !== -1 && endAutoProv !== -1) {
  // Replace this block with a function call
  const replacement = `    // Auto-provisioning is now handled out of band by syncSystemKeys()
    await syncSystemKeys();
    systemKeys = await db.select().from(userApiKeys).where(and(isNull(userApiKeys.userId), eq(userApiKeys.isEnabled, true)));
    
    `;
  
  code = code.substring(0, startAutoProv) + replacement + code.substring(endAutoProv);
}

// 3. Inject syncSystemKeys outside the class
const classStart = code.indexOf('class GeminiFailoverModels');
const syncFunction = `
let isSyncingSystemKeys = false;
let lastSyncTime = 0;
async function syncSystemKeys() {
  const now = Date.now();
  if (now - lastSyncTime < 60000) return; // Debounce to 1 min
  if (isSyncingSystemKeys) return;
  
  isSyncingSystemKeys = true;
  try {
    const envKeys = [
      { key: process.env.AI_INTEGRATIONS_GEMINI_API_KEY, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_1, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_2, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY_3, provider: "gemini" },
      { key: process.env.GEMINI_API_KEY, provider: "gemini" },
      { key: process.env.OPENROUTER_API_KEY, provider: "openrouter" },
      { key: process.env.OPENROUTER_KEY, provider: "openrouter" },
      { key: process.env.GROQ_API_KEY, provider: "groq" }
    ].filter(k => !!k.key);

    let allDbSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));
    if (envKeys.length > 0) {
      const envKeyStrings = envKeys.map(k => k.key);
      for (const sysKey of allDbSystemKeys) {
        let decrypted = "";
        try { decrypted = crypto.decrypt(sysKey.encryptedKey) || sysKey.encryptedKey; } catch { decrypted = sysKey.encryptedKey; }
        if (!envKeyStrings.includes(decrypted)) {
           try { await db.delete(userApiKeys).where(eq(userApiKeys.id, sysKey.id)); } catch (e) {}
        }
      }
      
      allDbSystemKeys = await db.select().from(userApiKeys).where(isNull(userApiKeys.userId));
      const decryptedAllSystemKeys = allDbSystemKeys.map(k => {
        try { return crypto.decrypt(k.encryptedKey) || k.encryptedKey; } catch { return k.encryptedKey; }
      });

      const keysToInsert = envKeys.filter(envK => !decryptedAllSystemKeys.includes(envK.key));
      for (let i = 0; i < keysToInsert.length; i++) {
        const item = keysToInsert[i];
        try {
          const encryptedKey = crypto.encrypt(item.key);
          const maskedKey = item.provider === "gemini" ? \`AIza****\${item.key.slice(-4)}\` : \`\${item.provider.toUpperCase()}****\${item.key.slice(-4)}\`;
          await db.insert(userApiKeys).values({
            name: \`System Key \${allDbSystemKeys.length + 1} (\${item.provider.toUpperCase()} Auto-Provisioned)\`,
            provider: item.provider,
            encryptedKey: encryptedKey,
            maskedKey: maskedKey,
            isPrimary: allDbSystemKeys.length === 0 && i === 0,
            isEnabled: true,
            isSystem: true,
            status: "HEALTHY",
            availableModels: item.provider === "openrouter" ? ["google/gemini-2.0-flash-exp:free"] : ["gemini-2.0-flash", "gemini-1.5-flash"]
          }).onConflictDoNothing(); // Not possible on encrypted key without constraint, but we rely on memory lock to avoid race
          allDbSystemKeys.push({} as any);
        } catch (e) {
          console.error("[System Keys] Insert error", e);
        }
      }
    }
    lastSyncTime = Date.now();
  } finally {
    isSyncingSystemKeys = false;
  }
}
`;

code = code.substring(0, classStart) + syncFunction + code.substring(classStart);

// 4. Update the retryable logic to NOT retry 404
const retryableReplacement = `const isRetryableError = (err: any): boolean => {
  if (!err) return false;
  const status = err?.status || err?.response?.status || err?.code;
  if (status === 404 || status === 403 || status === 429) return false; // Never retry these
  if (status === 503 || status === 502 || status === 504 || status === 500 || status === 408) {
    return true;
  }
  const statusStr = String(err?.status || err?.response?.status || err?.code || "").toUpperCase();
  if (statusStr === "UNAVAILABLE" || statusStr === "INTERNAL") {
    return true;
  }
  const errMessage = String(err?.message || err?.stack || err).toLowerCase();
  if (errMessage.includes("404") || errMessage.includes("not found")) return false; // Never retry 404
  const retryableKeywords = [
    "503", "500", "502", "504",
    "unavailable", "timeout", "deadline exceeded",
    "overloaded", "service unavailable", "internal server error",
    "spikes in demand", "experiencing high demand", "try again later"
  ];
  return retryableKeywords.some(keyword => errMessage.includes(keyword));
};`;
const oldRetryableStart = code.indexOf('const isRetryableError = (err: any): boolean => {');
const oldRetryableEnd = code.indexOf('};', oldRetryableStart) + 2;
code = code.substring(0, oldRetryableStart) + retryableReplacement + code.substring(oldRetryableEnd);

fs.writeFileSync(path, code);
console.log('Fixed client.ts');
