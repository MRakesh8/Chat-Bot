import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { knowledgeChunks } from "@workspace/db";

export type KnowledgeScope = "general" | "workspace" | "project";
export type VisibilityRole = "admin" | "super_admin" | "client" | "user" | string | null | undefined;

export type KnowledgeContext = {
  scope: KnowledgeScope;
  userId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  userRole?: VisibilityRole;
};

function isAdminRole(role: VisibilityRole) {
  return role === "admin" || role === "super_admin";
}

export function buildVisibilityCondition(role: VisibilityRole): SQL {
  return isAdminRole(role)
    ? inArray(knowledgeChunks.visibility, ["admin", "client"])
    : eq(knowledgeChunks.visibility, "client");
}

export function buildKnowledgeScopeCondition(context: KnowledgeContext): SQL | null {
  if (context.scope === "general") {
    if (!context.userId) return null;
    return and(
      eq(knowledgeChunks.scope, "general"),
      eq(knowledgeChunks.userId, context.userId),
    ) ?? null;
  }

  if (context.scope === "project") {
    if (!context.projectId) return null;
    const scopeCondition = and(
      eq(knowledgeChunks.scope, "project"),
      eq(knowledgeChunks.projectId, context.projectId),
    );
    if (!scopeCondition) return null;
    return context.userId
      ? and(scopeCondition, eq(knowledgeChunks.userId, context.userId)) ?? null
      : scopeCondition;
  }

  if (!context.workspaceId) return null;
  const workspaceCondition = or(
    and(
      eq(knowledgeChunks.scope, "workspace"),
      eq(knowledgeChunks.workspaceId, context.workspaceId),
    ),
    and(
      eq(knowledgeChunks.scope, "project"),
      eq(knowledgeChunks.workspaceId, context.workspaceId),
    ),
  );
  if (!workspaceCondition) return null;
  return context.userId
    ? and(workspaceCondition, eq(knowledgeChunks.userId, context.userId)) ?? null
    : workspaceCondition;
}

export function buildKnowledgeIsolationCondition(context: KnowledgeContext): SQL | null {
  const scopeCondition = buildKnowledgeScopeCondition(context);
  if (!scopeCondition) return null;
  return and(scopeCondition, buildVisibilityCondition(context.userRole)) ?? null;
}
