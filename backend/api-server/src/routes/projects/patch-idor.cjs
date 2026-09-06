const fs = require('fs');

let content = fs.readFileSync('index.ts', 'utf8');

const secureCheck = `  const userId = (req as any).auth?.userId ?? null;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const projectMeta = await withBypassRLS(async (tx: any) => {
      return await tx.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    });
    if (!projectMeta[0]) return res.status(404).json({ error: "Project not found" });
    resolvedOrgId = projectMeta[0].organizationId;
  }

  const isSuperAdmin = (req as any).auth?.dbUser?.role === "super_admin";
  const membership = (req as any).auth?.memberships?.find((m: any) => m.organizationId === resolvedOrgId);
  if (!isSuperAdmin && !membership) {
    return res.status(403).json({ error: "Forbidden: Access denied to this project" });
  }
`;

// Helper regex to replace the first part of the function body
function patchRoute(regex, replacement) {
  content = content.replace(regex, replacement);
}

// 1. discovery/start
patchRoute(
  /router\.post\("\/:projectId\/discovery\/start", async \(req: any, res: any\): Promise<any> => \{\n  const \{ projectId \} = req\.params;\n  const \{ url \} = req\.body;\n  const orgId = req\.headers\["x-organization-id"\] \|\| req\.query\.organizationId;\n  if \(Array\.isArray\(orgId\)\) return res\.status\(400\)\.json\(\{ error: "Invalid organization ID" \}\);\n\n  if \(!url \|\| typeof url !== "string"\) \{\n    return res\.status\(400\)\.json\(\{ error: "URL is required" \}\);\n  \}/,
  `router.post("/:projectId/discovery/start", async (req: any, res: any): Promise<any> => {
  const { projectId } = req.params;
  const { url } = req.body;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });
  if (!url || typeof url !== "string") return res.status(400).json({ error: "URL is required" });

${secureCheck}
`
);

// 2. discovery/status
patchRoute(
  /router\.get\("\/:projectId\/discovery\/status", async \(req: any, res: any\): Promise<any> => \{\n  const \{ projectId \} = req\.params;\n  const orgId = req\.headers\["x-organization-id"\] \|\| req\.query\.organizationId;\n  if \(Array\.isArray\(orgId\)\) return res\.status\(400\)\.json\(\{ error: "Invalid organization ID" \}\);/,
  `router.get("/:projectId/discovery/status", async (req: any, res: any): Promise<any> => {
  const { projectId } = req.params;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

${secureCheck}
`
);

// 3. intelligence
patchRoute(
  /router\.get\("\/:projectId\/intelligence", async \(req: any, res: any\): Promise<any> => \{\n  const \{ projectId \} = req\.params;\n  const orgId = req\.headers\["x-organization-id"\] \|\| req\.query\.organizationId;\n  if \(Array\.isArray\(orgId\)\) return res\.status\(400\)\.json\(\{ error: "Invalid organization ID" \}\);/,
  `router.get("/:projectId/intelligence", async (req: any, res: any): Promise<any> => {
  const { projectId } = req.params;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

${secureCheck}
`
);

// 4. capabilities
patchRoute(
  /router\.get\("\/:projectId\/capabilities", async \(req: any, res: any\): Promise<any> => \{\n  const \{ projectId \} = req\.params;\n  const orgId = req\.headers\["x-organization-id"\] \|\| req\.query\.organizationId;\n  if \(Array\.isArray\(orgId\)\) return res\.status\(400\)\.json\(\{ error: "Invalid organization ID" \}\);/,
  `router.get("/:projectId/capabilities", async (req: any, res: any): Promise<any> => {
  const { projectId } = req.params;
  const orgId = req.headers["x-organization-id"] || req.query.organizationId;
  if (Array.isArray(orgId)) return res.status(400).json({ error: "Invalid organization ID" });

${secureCheck}
`
);

// Replace orgId as string with resolvedOrgId in withTenantContext calls
content = content.replace(/await withTenantContext\(orgId as string/g, 'await withTenantContext(resolvedOrgId as string');

fs.writeFileSync('index.ts', content);
console.log('Patched');
