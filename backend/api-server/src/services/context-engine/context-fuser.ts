/**
 * @file context-fuser.ts
 * @description Merges website context with Knowledge Base search results to
 * produce a unified, natural-language context string for the LLM prompt.
 */
import type {
  WebsiteContext,
  ContextSettings,
  FusedContext,
  DetectedMistake,
  PrioritizedItem,
  FormContext,
  FormFieldContext,
  CardContext,
  TableContext,
  StatContext,
  NotificationContext,
  DialogContext,
  ChartContext,
} from "./types";
import { searchProjectKnowledge } from "../knowledge";
import { intentClassifier } from "./intent-classifier";

// ---------------------------------------------------------------------------
// Context Fuser
// ---------------------------------------------------------------------------

export class ContextFuser {
  /**
   * Fuses website context with knowledge-base results.
   *
   * 1. Formats the website context into readable prose.
   * 2. Detects potential mistakes (empty required fields, visible errors).
   * 3. Augments the KB search query with page signals.
   * 4. Calls the existing `searchProjectKnowledge()` RAG function.
   * 5. Returns both context strings + detected mistakes.
   */
  async fuse(params: {
    userMessage: string;
    websiteContext: WebsiteContext | null;
    projectId: string;
    userId: string | null;
    settings: ContextSettings;
    apiKeys?: any[];
  }): Promise<FusedContext> {
    const { userMessage, websiteContext, projectId, userId, settings, apiKeys } = params;

    // ── 0. Intent Classification ──
    let userIntent: any = "General Question";
    if (apiKeys && apiKeys.length > 0) {
      const activeKey = apiKeys[0].decryptedKey || apiKeys[0].encryptedKey;
      userIntent = await intentClassifier.classify({
        userMessage,
        apiKey: activeKey
      });
    }

    const needsWebsiteContext = ["Website Question", "Dashboard Analysis", "Form Assistance", "Table Analysis", "Navigation Help", "General Question"].includes(userIntent);
    const needsKbContext = ["Knowledge Question", "Website Question", "General Question", "Pricing"].includes(userIntent);

    // ── 1. Format website context ──
    const websiteContextString = (websiteContext && needsWebsiteContext)
      ? this.formatWebsiteContext(websiteContext, settings)
      : "";

    // ── 2. Detect mistakes ──
    const detectedMistakes: DetectedMistake[] =
      websiteContext && settings.mistakeDetection
        ? this.detectMistakes(websiteContext)
        : [];

    // ── 3. Augmented KB query ──
    const augmentedQuery = this.augmentQuery(userMessage, websiteContext);

    // ── 4. Knowledge base search ──
    let kbContextString = "";
    let knowledgeChunks: any[] = [];
    if (needsKbContext) {
      try {
        const searchResult = await searchProjectKnowledge({
          projectIds: [projectId],
          userId,
          query: augmentedQuery,
          limit: 3,
        });
        kbContextString = searchResult.contextString;
        knowledgeChunks = searchResult.candidates || [];
      } catch (err) {
        console.error("Context fuser: KB search failed:", err);
      }
    }

    return {
      websiteContextString,
      kbContextString,
      detectedMistakes,
      pageType: websiteContext?.page?.type,
      knowledgeChunks,
      userIntent
    };
  }

  // =========================================================================
  // Format website context into natural language
  // =========================================================================

  private formatWebsiteContext(
    ctx: any,
    settings: ContextSettings
  ): string {
    const sections: string[] = [];

    // Normalize v1 (segments) and v2 (content) payloads
    const page = ctx.page || ctx.segments?.page;
    const content = ctx.content || ctx.segments;
    const navigation = ctx.navigation || ctx.segments?.navigation;

    // ── Page info ──
    if (page) {
      sections.push(
        [
          `Current Page: ${page.heading || page.title || "Unknown"} (${page.url || page.path || ""})`,
          `Page Type: ${page.pageType || page.type || "Unknown"}`,
          page.breadcrumbs?.length
            ? `Breadcrumbs: ${page.breadcrumbs.join(" > ")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }

    // ── Navigation ──
    if (settings.navigationAssistant && navigation) {
      const navItems = navigation.items || navigation || [];
      if (navItems.length) {
        const formatted = navItems
          .map((i: any) => {
            const d = i.data ?? i;
            return d.active ? `**${d.label}** (active)` : d.label;
          })
          .join(" | ");
        sections.push(`Navigation: ${formatted}`);
      }
      const tabs = navigation.tabs || [];
      if (tabs.length) {
        const formatted = tabs
          .map((t: any) => {
            const d = t.data ?? t;
            return d.active ? `**${d.label}** (selected)` : d.label;
          })
          .join(" | ");
        sections.push(`Tabs: ${formatted}`);
      }
    }

    // ── Cards / Stats ──
    if (settings.dashboardAnalysis && content) {
      const cards = this.unwrap<CardContext>(content.cards);
      const stats = this.unwrap<StatContext>(content.stats);
      const combined = [...cards, ...stats].filter((c: any) => c.title || c.label || c.value);
      if (combined.length) {
        const lines = combined.map((c: any) => {
          const label = c.title || c.label || "—";
          const value = c.value ?? "";
          const trend =
            c.trend === "up"
              ? " (↑)"
              : c.trend === "down"
                ? " (↓)"
                : "";
          const change = c.change ? ` ${c.change}` : "";
          return `  • ${label}: ${value}${trend}${change}`;
        });
        sections.push(`Visible Dashboard Cards & Stats:\n${lines.join("\n")}`);
      }
    }

    // ── Tables ──
    if (settings.tableAnalysis && content?.tables?.length) {
      const tables = this.unwrap<TableContext>(content.tables);
      for (const t of tables.slice(0, 2)) {
        const header = t.headers?.join(" | ") || "";
        const rowInfo = t.rowCount != null ? `${t.rowCount} rows` : "";
        const sortInfo =
          t.sortColumn
            ? `sorted by ${t.sortColumn} ${t.sortDirection || ""}`
            : "";
        const pageInfo =
          t.pagination
            ? `page ${t.pagination.currentPage}/${t.pagination.totalPages}`
            : "";
        const selected = t.selectedRow
          ? `\n  Selected row: ${t.selectedRow.join(" | ")}`
          : "";
        
        // Format visible rows so the LLM has access to the actual table records
        let rowsFormatted = "";
        if (t.visibleRows && t.visibleRows.length > 0) {
          const rowLines = t.visibleRows.map((r: string[], idx: number) => `    Row ${idx + 1}: ${r.join(" | ")}`);
          rowsFormatted = `\n  Visible Rows:\n${rowLines.join("\n")}`;
        } else {
          rowsFormatted = "\n  No visible rows extracted.";
        }

        const meta = [rowInfo, sortInfo, pageInfo].filter(Boolean).join(", ");
        const caption = t.caption ? `Table "${t.caption}"` : "Data Table";
        sections.push(
          `${caption} (${meta}):\n  Columns: ${header}${selected}${rowsFormatted}`
        );
      }
    }

    // ── Forms ──
    if (settings.formAssistant && content?.forms?.length) {
      const forms = this.unwrap<FormContext>(content.forms);
      for (const f of forms.slice(0, 2)) {
        const title = f.title || f.id || "Form";
        const fieldLines = (f.fields || [])
          .filter((fld: FormFieldContext) => fld.label)
          .map((fld: FormFieldContext) => {
            const req = fld.required ? " (required)" : "";
            const errFlag = fld.hasError
              ? ` ⚠️ Error: ${fld.errorMessage || "validation error"}`
              : "";
            const val = fld.value
              ? fld.value === "[REDACTED]"
                ? " [REDACTED]"
                : ` = "${fld.value}"`
              : " (empty)";
            return `  • ${fld.label}${req}${val}${errFlag}`;
          });
        const pct =
          f.completionPercent != null
            ? ` — ${f.completionPercent}% complete`
            : "";
        const errs = f.errorMessages?.length
          ? `\n  Errors: ${f.errorMessages.join("; ")}`
          : "";
        sections.push(
          `${title}${pct}:\n${fieldLines.join("\n")}${errs}`
        );
      }
    }

    // ── Charts ──
    if (settings.dashboardAnalysis && ctx.content?.charts?.length) {
      const charts = this.unwrap<ChartContext>(ctx.content.charts);
      if (charts.length) {
        const lines = charts.map(
          (c) => `  • ${c.title || "Chart"} (${c.type || "unknown"} chart)${c.description ? `: ${c.description}` : ""}`
        );
        sections.push(`Visible Charts:\n${lines.join("\n")}`);
      }
    }

    // ── Notifications ──
    if (ctx.content?.notifications?.length) {
      const notifs = this.unwrap<NotificationContext>(ctx.content.notifications);
      if (notifs.length) {
        const lines = notifs.map(
          (n) => `  • [${(n.type || "info").toUpperCase()}] ${n.message}`
        );
        sections.push(`Page Notifications:\n${lines.join("\n")}`);
      }
    }

    // ── Open Dialogs ──
    if (ctx.content?.dialogs?.length) {
      const dialogs = this.unwrap<DialogContext>(ctx.content.dialogs);
      const open = dialogs.filter((d) => d);
      if (open.length) {
        const lines = open.map(
          (d) =>
            `  • "${d.title || "Dialog"}"${d.content ? `: ${d.content.slice(0, 100)}` : ""}`
        );
        sections.push(`Open Dialogs:\n${lines.join("\n")}`);
      }
    }

    // ── Workflow ──
    if (ctx.workflow?.totalSteps) {
      const step = ctx.workflow.completedSteps ?? 0;
      const total = ctx.workflow.totalSteps;
      const pct = ctx.workflow.progressPercent
        ? ` (${ctx.workflow.progressPercent}%)`
        : "";
      const labels = ctx.workflow.stepLabels?.length
        ? `\n  Steps: ${ctx.workflow.stepLabels.join(" → ")}`
        : "";
      const blocker = ctx.workflow.blockedBy
        ? `\n  ⚠️ Blocked by: ${ctx.workflow.blockedBy}`
        : "";
      sections.push(
        `Workflow: Step ${step + 1} of ${total}${pct}${labels}${blocker}`
      );
    }

    // ── Memory ──
    const memory = ctx.state?.memory || ctx.memory || ctx.segments?.memory || ctx.state || {};
    if (settings.contextMemory && memory) {
      const memSections: string[] = [];

      if (memory.recentActions?.length) {
        memSections.push(`Recent actions: ${memory.recentActions.join(" -> ")}`);
      }
      if (memory.selectedFilters && Object.keys(memory.selectedFilters).length) {
        memSections.push(`Filters applied: ${JSON.stringify(memory.selectedFilters)}`);
      }
      if (memory.currentCustomer) {
        memSections.push(`Viewing customer: ${memory.currentCustomer}`);
      }

      if (memSections.length) {
        sections.push(`Context Memory:\n  ` + memSections.join("\n  "));
      }
    }

    // ── Interaction state summary ──
    const stateNotes: string[] = [];
    if (memory.visibleErrors?.length) {
      stateNotes.push(
        `Visible errors: ${memory.visibleErrors.join("; ")}`
      );
    }
    if (memory.visibleWarnings?.length) {
      stateNotes.push(
        `Visible warnings: ${memory.visibleWarnings.join("; ")}`
      );
    }
    if (memory.selectedTab) {
      stateNotes.push(`Selected tab: ${memory.selectedTab}`);
    }
    if (memory.activeFilters?.length) {
      stateNotes.push(
        `Active filters: ${memory.activeFilters.map((f: any) => `${f.field}=${f.value}`).join(", ")}`
      );
    }
    if (stateNotes.length) {
      sections.push(stateNotes.join("\n"));
    }

    // ── Custom Containers ──
    const customContainers = this.unwrap<any>(content.customContainers);
    if (customContainers.length) {
      const lines = customContainers.map((c: any) => `  • [${c.selector}]: ${c.text}`);
      sections.push(`Custom Scraped Elements:\n${lines.join("\n")}`);
    }

    // ── Injected Context ──
    const injected = ctx.injectedContext || ctx.segments?.injectedContext;
    if (injected) {
      sections.push(`Manually Injected App Context:\n${injected}`);
    }

    if (!sections.length) {
      return "No structured website context available.";
    }

    return sections.join("\n\n");
  }

  // =========================================================================
  // Mistake detection
  // =========================================================================

  private detectMistakes(ctx: WebsiteContext): DetectedMistake[] {
    const mistakes: DetectedMistake[] = [];

    // ── Form errors ──
    const forms = this.unwrap<FormContext>(ctx.content?.forms);
    for (const form of forms) {
      for (const field of form.fields || []) {
        if (field.required && !field.value && field.type !== "hidden") {
          mistakes.push({
            type: "missing_required_field",
            element: `Form field "${field.label}"`,
            message: `${field.label} is required but appears to be empty`,
            severity: "warning",
          });
        }
        if (field.hasError && field.errorMessage) {
          mistakes.push({
            type: "form_validation_error",
            element: `Form field "${field.label}"`,
            message: field.errorMessage,
            severity: "error",
          });
        }
      }
    }

    // ── Visible error notifications ──
    const notifs = this.unwrap<NotificationContext>(ctx.content?.notifications);
    for (const n of notifs) {
      if (n.type === "error") {
        mistakes.push({
          type: "visible_error",
          element: "Page notification",
          message: n.message,
          severity: "error",
        });
      }
    }

    // ── State-level errors ──
    if (ctx.state?.visibleErrors?.length) {
      for (const err of ctx.state.visibleErrors) {
        mistakes.push({
          type: "visible_error",
          element: "Page",
          message: err,
          severity: "error",
        });
      }
    }

    return mistakes;
  }

  // =========================================================================
  // Augment KB query with context signals
  // =========================================================================

  private augmentQuery(
    userMessage: string,
    ctx: WebsiteContext | null
  ): string {
    if (!ctx) return userMessage;

    const signals: string[] = [];
    if (ctx.page?.type && ctx.page.type !== "unknown") {
      signals.push(ctx.page.type);
    }
    if (ctx.page?.heading) {
      signals.push(ctx.page.heading);
    }

    // If user is on a form page mentioning errors, boost error-related KB retrieval
    if (ctx.state?.visibleErrors?.length) {
      signals.push("error");
    }

    if (!signals.length) return userMessage;
    return `${userMessage} [context: ${signals.join(", ")}]`;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Unwraps an array that may contain raw items or `PrioritizedItem<T>` wrappers.
   * The widget may send either format depending on version.
   */
  private unwrap<T>(items: any[] | undefined | null): T[] {
    if (!items || !Array.isArray(items)) return [];
    return items.map((i) => (i && typeof i === "object" && "data" in i ? i.data : i));
  }
}
