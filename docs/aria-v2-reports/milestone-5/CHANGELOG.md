# Aria AI v2 - Milestone 5 Changelog

## Added
- **SecurityAgent**: Introduced a mandatory security gating pipeline (`agents/security.ts`) that runs synchronously before any destructive action is authorized.
- **Enterprise Audit Logs**: Hooked the SecurityAgent to Drizzle `enterprise_audit_logs`, tracking `projectId`, `userId`, `actionType`, and `targetElement` with immutable `status` traces (ALLOWED, DENIED, PENDING_CONFIRMATION).
- **Human-in-the-loop (HITL)**: Defined a state machine flag `requiresConfirmation` inside the SecurityAgent. If a project policy enforces HITL for sensitive actions, the Coordinator alters the action payload to `pending_confirmation`.
- **RBAC Enforcement**: Hard-blocks actions if `allowDestructiveActions` is flagged `false` at the project level, generating a clear feedback loop to the chat widget.
