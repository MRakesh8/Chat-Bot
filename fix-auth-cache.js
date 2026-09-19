const fs = require('fs');

const path = 'd:\\Project\\Chat-bot\\backend\\api-server\\src\\middlewares\\supabaseAuth.ts';
let code = fs.readFileSync(path, 'utf8');

const cacheLogic = `
// Short-lived in-memory cache for auth to prevent hammering Supabase and the DB
// Cache TTL is 30 seconds to be safe with role/permission changes
const authCache = new Map<string, { expiresAt: number; authObj: any }>();
const CACHE_TTL_MS = 30 * 1000;

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of authCache.entries()) {
    if (now > value.expiresAt) {
      authCache.delete(key);
    }
  }
}, 60000).unref();
`;

// Insert cache logic after imports
const lastImportIdx = code.lastIndexOf('import ');
const endOfImport = code.indexOf('\n', lastImportIdx);
code = code.substring(0, endOfImport + 1) + cacheLogic + code.substring(endOfImport + 1);

// Inside the middleware, after getting token:
const tokenStart = code.indexOf('const token = authHeader.split(" ")[1];');
if (tokenStart !== -1) {
  const tokenEnd = code.indexOf('\n', tokenStart);
  const cacheCheck = `
  const now = Date.now();
  const cached = authCache.get(token);
  if (cached && now < cached.expiresAt) {
    (req as any).auth = cached.authObj;
    return next();
  }
`;
  code = code.substring(0, tokenEnd) + cacheCheck + code.substring(tokenEnd);
  
  // Now, at the end where (req as any).auth is set, we cache it
  const authSetStart = code.indexOf('(req as any).auth = {', tokenEnd);
  const authSetEnd = code.indexOf('};', authSetStart) + 2;
  
  const cacheSet = `
    const authObj = (req as any).auth;
    authCache.set(token, { expiresAt: Date.now() + CACHE_TTL_MS, authObj });
`;
  code = code.substring(0, authSetEnd) + cacheSet + code.substring(authSetEnd);
}

fs.writeFileSync(path, code);
console.log('Fixed supabaseAuth.ts');
