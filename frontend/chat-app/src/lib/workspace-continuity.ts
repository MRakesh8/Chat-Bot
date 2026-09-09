/**
 * Workspace Continuity & State Isolation Manager
 * Stores safe, non-sensitive UI state (scroll positions, project active tabs,
 * unsent chat drafts, search/filter preferences) with strict project key isolation
 * and complete cleanup on sign-out or project switch.
 */

// In-memory continuity maps (isolated per browser session, non-sensitive)
const scrollPositionsMap = new Map<string, number>();
const projectTabsMap = new Map<string, string>();
const chatDraftsMap = new Map<string, string>();

let projectsFilterState = {
  searchQuery: "",
  sortBy: "newest",
  currentPage: 1,
};

/**
 * Scroll Position Utilities
 */
export function getSavedScrollPosition(path: string): number {
  return scrollPositionsMap.get(path) || 0;
}

export function saveScrollPosition(path: string, scrollTop: number): void {
  if (path) {
    scrollPositionsMap.set(path, scrollTop);
  }
}

/**
 * Project Tab Continuity (Strictly keyed by projectId)
 */
export function getSavedProjectTab(projectId: string): string | null {
  if (!projectId) return null;
  return projectTabsMap.get(`proj_tab_${projectId}`) || null;
}

export function saveProjectTab(projectId: string, tab: string): void {
  if (projectId && tab) {
    projectTabsMap.set(`proj_tab_${projectId}`, tab);
  }
}

/**
 * Chat Draft Continuity (Keyed by conversation ID or 'new')
 */
export function getSavedChatDraft(convId: string): string {
  return chatDraftsMap.get(`draft_${convId}`) || "";
}

export function saveChatDraft(convId: string, text: string): void {
  if (text.trim()) {
    chatDraftsMap.set(`draft_${convId}`, text);
  } else {
    chatDraftsMap.delete(`draft_${convId}`);
  }
}

/**
 * Projects List Filter Continuity
 */
export function getProjectsFilterState() {
  return { ...projectsFilterState };
}

export function saveProjectsFilterState(state: { searchQuery: string; sortBy: string; currentPage: number }) {
  projectsFilterState = { ...state };
}

/**
 * Project Switch Reset (Constraint 8)
 * Clears state for a specific project when switching away, preventing cross-project state leakage.
 */
export function resetProjectState(projectId: string) {
  if (projectId) {
    projectTabsMap.delete(`proj_tab_${projectId}`);
  }
}

/**
 * Full Cleanup on Sign Out (Constraint 7)
 * Clears all UI continuity state, chat drafts, scroll positions, and filters.
 */
export function clearAllContinuityState() {
  scrollPositionsMap.clear();
  projectTabsMap.clear();
  chatDraftsMap.clear();
  projectsFilterState = { searchQuery: "", sortBy: "newest", currentPage: 1 };
}
