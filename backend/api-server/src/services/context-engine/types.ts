/**
 * @file types.ts
 * @description TypeScript interfaces for the Website Context Engine v2.0.
 * These types represent structured webpage context extracted by the embeddable
 * widget's DOM scanner and sent to the backend for AI-assisted conversations.
 */

// ---------------------------------------------------------------------------
// WebsiteContext v2 — the full context payload from the widget
// ---------------------------------------------------------------------------

/** Top-level context payload sent by the widget on every extraction cycle. */
export interface WebsiteContext {
  version: "2.0";
  timestamp: number;
  extractionDurationMs: number;
  transport: ContextTransport;
  page: PageContext;
  navigation: NavigationContext;
  content: ContentContext;
  state: InteractionState;
  workflow: WorkflowContext;
  viewport: ViewportContext;
  metadata: ExtractionMetadata;
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Controls full vs. delta delivery and segment-level change tracking. */
export interface ContextTransport {
  mode: "full" | "delta";
  sessionHash: string;
  segmentHashes: Record<string, string>;
  changedSegments: string[];
  unchangedSegments: string[];
  sequenceNumber: number;
}

// ---------------------------------------------------------------------------
// Viewport
// ---------------------------------------------------------------------------

/** Information about the user's visible viewport. */
export interface ViewportContext {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  scrollDepthPercent: number;
  visibleElementCount: number;
  totalElementCount: number;
  viewportCoveragePercent: number;
  focusedSection?: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Basic page-level metadata. */
export interface PageContext {
  url: string;
  path: string;
  title: string;
  type: PageType;
  breadcrumbs: string[];
  heading: string;
  description?: string;
}

/** Exhaustive set of recognised page archetypes. */
export type PageType =
  | "dashboard"
  | "form"
  | "table"
  | "list"
  | "detail"
  | "settings"
  | "report"
  | "checkout"
  | "auth"
  | "landing"
  | "search"
  | "editor"
  | "calendar"
  | "kanban"
  | "profile"
  | "wizard"
  | "unknown";

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Current navigation state — top-nav, tabs, and sidebar. */
export interface NavigationContext {
  activeItem?: string;
  items: { label: string; active: boolean }[];
  tabs?: { label: string; active: boolean }[];
  sidebar?: { label: string; active: boolean }[];
}

// ---------------------------------------------------------------------------
// Prioritised content wrapper
// ---------------------------------------------------------------------------

/** Wraps any content element with viewport-aware priority scoring. */
export interface PrioritizedItem<T> {
  data: T;
  priority: number;
  inViewport: boolean;
  distanceFromViewport: number;
  relevanceSignals: string[];
}

// ---------------------------------------------------------------------------
// Content contexts
// ---------------------------------------------------------------------------

/** All extracted content elements, prioritised by viewport relevance. */
export interface ContentContext {
  headings: PrioritizedItem<string>[];
  cards: PrioritizedItem<CardContext>[];
  tables: PrioritizedItem<TableContext>[];
  forms: PrioritizedItem<FormContext>[];
  charts: PrioritizedItem<ChartContext>[];
  lists: PrioritizedItem<ListContext>[];
  notifications: PrioritizedItem<NotificationContext>[];
  dialogs: PrioritizedItem<DialogContext>[];
  buttons: PrioritizedItem<ButtonContext>[];
  stats: PrioritizedItem<StatContext>[];
  canvasElements: CanvasContext[];
}

/** Dashboard / summary card. */
export interface CardContext {
  title?: string;
  value?: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

/** Data table with optional pagination/sort state. */
export interface TableContext {
  caption?: string;
  headers: string[];
  rowCount: number;
  visibleRows: string[][];
  selectedRow?: string[];
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems?: number;
  };
}

/** Form with field-level detail. */
export interface FormContext {
  id?: string;
  title?: string;
  fields: FormFieldContext[];
  submitLabel?: string;
  hasErrors: boolean;
  errorMessages: string[];
  completionPercent: number;
}

/** Individual form field. */
export interface FormFieldContext {
  label: string;
  type: string;
  name: string;
  value: string;
  placeholder?: string;
  required: boolean;
  hasError: boolean;
  errorMessage?: string;
  options?: string[];
}

/** Chart / visualisation. */
export interface ChartContext {
  type: string;
  title?: string;
  labels?: string[];
  description?: string;
}

/** Ordered / unordered / definition list. */
export interface ListContext {
  title?: string;
  items: string[];
  totalCount: number;
  type: "ordered" | "unordered" | "definition";
}

/** Toast / banner notification. */
export interface NotificationContext {
  type: "success" | "error" | "warning" | "info";
  message: string;
}

/** Modal / dialog overlay. */
export interface DialogContext {
  title?: string;
  content?: string;
  actions: string[];
  isModal: boolean;
}

/** Clickable button. */
export interface ButtonContext {
  label: string;
  type: string;
  disabled: boolean;
  variant?: string;
}

/** KPI / stat widget. */
export interface StatContext {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
}

/** Canvas / SVG chart element. */
export interface CanvasContext {
  type: string;
  ariaLabel?: string;
  figcaption?: string;
  title?: string;
  chartLibrary?: string;
  dimensions: { width: number; height: number };
  svgTextContent?: string[];
}

// ---------------------------------------------------------------------------
// Interaction state
// ---------------------------------------------------------------------------

/** Snapshot of the user's current interaction state on the page. */
export interface InteractionState {
  selectedRow?: Record<string, string>;
  activeFilters: { field: string; value: string }[];
  selectedTab?: string;
  openDialogs: string[];
  visibleErrors: string[];
  visibleWarnings: string[];
  focusedElement?: string;
  scrollPosition: "top" | "middle" | "bottom";
  idleTimeMs: number;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/** Multi-step workflow / wizard progress tracking. */
export interface WorkflowContext {
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: number;
  stepLabels?: string[];
  progressPercent?: number;
  detectedWorkflowType?: string;
  blockedBy?: string;
}

// ---------------------------------------------------------------------------
// Extraction metadata
// ---------------------------------------------------------------------------

/** Telemetry from the widget's extraction engine. */
export interface ExtractionMetadata {
  framework: string;
  spaDetected: boolean;
  domNodeCount: number;
  viewportNodeCount: number;
  extractedElementCount: number;
  cacheHit: boolean;
  mutationsSinceLastExtraction: number;
  compressionRatio: number;
}

// ---------------------------------------------------------------------------
// Session memory
// ---------------------------------------------------------------------------

/** Per-session state maintained server-side across conversation turns. */
export interface SessionMemory {
  sessionId: string;
  currentPage: string;
  previousPage: string | null;
  pageHistory: string[];
  currentCustomer?: string;
  selectedFilters: Record<string, string>;
  selectedTab?: string;
  currentWorkflow?: string;
  openDialogs: string[];
  recentActions: string[];
  conversationTurns: number;
  createdAt: number;
  lastActivityAt: number;
}

// ---------------------------------------------------------------------------
// Context settings (mirrors the DB table)
// ---------------------------------------------------------------------------

/** Feature flags controlling which context-engine capabilities are active. */
export interface ContextSettings {
  enabled: boolean;
  dashboardAnalysis: boolean;
  formAssistant: boolean;
  tableAnalysis: boolean;
  navigationAssistant: boolean;
  knowledgeComparison: boolean;
  mistakeDetection: boolean;
  contextMemory: boolean;
  developerDebugMode: boolean;
  maxContextSizeBytes: number;
}

// ---------------------------------------------------------------------------
// Fused context (output of the context-fuser)
// ---------------------------------------------------------------------------

/** Result of merging website context with Knowledge Base search results. */
export interface FusedContext {
  websiteContextString: string;
  kbContextString: string;
  detectedMistakes: DetectedMistake[];
  pageType?: PageType;
}

/** A potential mistake detected on the page (empty fields, validation, etc.). */
export interface DetectedMistake {
  type: string;
  element: string;
  message: string;
  severity: "error" | "warning" | "info";
}
