const fs = require('fs');

let c = fs.readFileSync('index.ts', 'utf8');

c = c.replace(
  'const entitlement = await checkProjectEntitlement(id);',
  'const isSuperAdminForEnt = (req as any).auth?.dbUser?.role === "super_admin";\n    const entitlement = await checkProjectEntitlement(id, isSuperAdminForEnt);'
);

// We need to replace it everywhere it appears. Let's do a global replace carefully.
c = c.replace(/const entitlement = await checkProjectEntitlement\(id\);/g, 'const isSuperAdminForEnt = (req as any).auth?.dbUser?.role === "super_admin";\n    const entitlement = await checkProjectEntitlement(id, isSuperAdminForEnt);');

fs.writeFileSync('index.ts', c);
console.log('Patched checkProjectEntitlement calls');
