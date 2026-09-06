const fs = require('fs');

let c = fs.readFileSync('pages/admin-clarity.tsx', 'utf8');
c = c.replace(/const isAdmin = user\?\.email === "rakesh837m@gmail\.com" \|\|\s*user\?\.email === "rakesh0837m@gmail\.com" \|\|\s*dbUser\?\.role === "super_admin";/, 
  'const isAdmin = dbUser?.role === "super_admin";');
fs.writeFileSync('pages/admin-clarity.tsx', c);

let p = fs.readFileSync('pages/admin-projects.tsx', 'utf8');
p = p.replace(/const isUnrestricted = user\?\.email === "rakesh837m@gmail\.com" \|\| user\?\.email === "rakesh0837m@gmail\.com";/, 
  'const isUnrestricted = dbUser?.role === "super_admin";');
fs.writeFileSync('pages/admin-projects.tsx', p);

let e = fs.readFileSync('pages/admin-project-edit.tsx', 'utf8');
e = e.replace(/const isAdmin = user\?\.email === "rakesh837m@gmail\.com" \|\|\s*user\?\.email === "rakesh0837m@gmail\.com" \|\|\s*dbUser\?\.role === "super_admin";/,
  'const isAdmin = dbUser?.role === "super_admin";');
fs.writeFileSync('pages/admin-project-edit.tsx', e);
