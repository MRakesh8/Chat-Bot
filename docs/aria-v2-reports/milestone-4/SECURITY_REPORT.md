# Aria AI v2 - Milestone 4 Security Report

- API adapters are executed completely client-side in the context of the user's browser, respecting the existing domain CORS policies and session cookies. No backend proxying or credential storage is required for actions like Shopify `/cart/add.js`.
