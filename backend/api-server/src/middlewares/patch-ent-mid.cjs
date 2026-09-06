const fs = require('fs');
let c = fs.readFileSync('entitlementMiddleware.ts', 'utf8');

c = c.replace(
  'export const requireActiveEntitlement = async (req: Request, res: Response, next: NextFunction) => {\n  const projectId = req.params.projectId || req.body.projectId;',
  'export const requireActiveEntitlement = async (req: Request, res: Response, next: NextFunction) => {\n  const projectId = req.params.projectId || req.body.projectId;\n  const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";'
);

c = c.replace(
  '  const entitlement = await checkProjectEntitlement(projectId);',
  '  const entitlement = await checkProjectEntitlement(projectId, isSuperAdmin);'
);

fs.writeFileSync('entitlementMiddleware.ts', c);
console.log('Patched entitlementMiddleware.ts');
