# Aria AI v2 - Milestone 3 Changelog

## Added
- **Browser Action Engine**: Implemented `widget-action-engine.js` on the frontend.
- **Robust Event Simulation**: Enabled full DOM event lifecycle support for clicks (`mousedown`, `mouseup`, `click`) and typing (`input`, `change`, native setter calls) to ensure compatibility with React/Vue controlled inputs.
- **Shadow DOM Support**: The Element Locator evaluator (`_findElement`) now executes a deep recursive search through `shadowRoot` trees if the element is not found in the light DOM.
- **Dynamic Observation Loop**: The Action Engine now binds a short-lived `MutationObserver` (800ms debounce) post-interaction to detect application state changes, simulating "wait for idle" mechanics.
- **Action SSE Streaming**: Integrated `CoordinatorAgent` into the primary `/chat` SSE stream in `widget-public.ts`, appending `{"action": {...}}` envelopes seamlessly after LLM chunking completes.
- **Tool Schema Definitions**: Added `actionToolSchema` in `agents/tools.ts` to enforce strictly typed outputs from the LLM when executing DOM actions.
