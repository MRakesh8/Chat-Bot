# Aria AI v2 - Milestone 1 Changelog

## Added
- **Database Schema**: Introduced `website_memory`, `agent_workflows`, `agent_skills`, `website_adapters`, `enterprise_audit_logs`, and `website_permissions` tables in Supabase via Drizzle ORM.
- **Universal Element Locator**: Added resilient element targeting utilizing CSS selectors, XPath expressions, ARIA attributes, semantic roles, and nearby semantic text extraction (`widget-context-engine.js`).
- **Semantic Website Graph Scanner**: Replaced flat DOM extraction with a Node-and-Edge graph payload (`contains` and `submits_to` relationships).
- **Smart Scroll Observer**: Implemented auto-discovery of scrollable/virtualized containers via CSS heuristics (`overflow` checks and layout heights).
- **Backend Memory Agent**: Created `MemoryAgent` (at `api-server/src/agents/memory.ts`) to fetch and persist website navigation boundaries natively.
- **Context Compressor Agent**: Created `ContextCompressorAgent` (`api-server/src/agents/contextCompressor.ts`) to intercept and purge low-confidence/low-importance semantic nodes before LLM generation.

## Changed
- Refactored `AriaContextEngine._extract` to compile standard `v2Segments` payloads incorporating Semantic Graph (`graph: {nodes, edges}`).
- Attached `UniversalLocator` properties to `forms`, `inputs`, and `buttons` on the client extraction stream.

## Security
- Maintained completely **read-only** extraction scope (no `click` or `type` methods implemented yet).
