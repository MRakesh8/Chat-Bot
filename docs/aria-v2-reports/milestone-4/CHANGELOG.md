# Aria AI v2 - Milestone 4 Changelog

## Added
- **Plugin SDK**: Introduced `aria-plugin-sdk.js` to allow native 3rd-party integration.
- **Built-in Adapters**: Shipped default implementations for `shopify` (cart manipulation) and `wordpress` (native search).
- **Auto-Detection Engine**: The SDK automatically sniffs `window.Shopify` or WordPress `<meta>` tags on load, registering the environment dynamically into the Context Engine's metadata blob (`activeAdapter`).
- **Hybrid Routing**: Re-architected `NavigationAgent` to intercept actions based on the `activeAdapter` flag. When present, the agent bypasses standard DOM generation and issues an `api_call` command envelope directly back to the Action Engine.
