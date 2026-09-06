const fs = require('fs');

let c = fs.readFileSync('entitlement.ts', 'utf8');

c = c.replace(
  'export async function checkProjectEntitlement(\n  projectId: string\n): Promise<EntitlementCheckResult> {',
  'export async function checkProjectEntitlement(\n  projectId: string,\n  isSuperAdmin?: boolean\n): Promise<EntitlementCheckResult> {'
);

c = c.replace(
  '    if (!projectId) {',
  `    if (isSuperAdmin) {
      return {
        allowed: true,
        status: "SUBSCRIPTION_ACTIVE",
        message: "Super Admin override",
      };
    }

    if (!projectId) {`
);

fs.writeFileSync('entitlement.ts', c);
console.log('Patched checkProjectEntitlement');
