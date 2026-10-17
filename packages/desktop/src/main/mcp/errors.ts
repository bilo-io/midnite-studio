/**
 * Thrown by a tool handler to answer with a specific `McpResponse` failure arm rather than the
 * generic `'error'` a thrown `Error` becomes in `dispatch.ts`. The class moved to the runtime
 * (Phase 113 Theme S) so a feature's tool factories can throw it; this re-export keeps the
 * server's importers on their old path, and keeps it one class, so `instanceof` still holds.
 */
export { McpToolError } from '@midnite/studio-runtime';
