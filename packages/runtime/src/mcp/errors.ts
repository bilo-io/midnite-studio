/**
 * Thrown by a tool handler to answer with a specific `McpResponse` failure arm
 * rather than the generic `'error'` a thrown `Error` becomes in the server's dispatch.
 *
 * Kept in its own module so neither dispatch (which builds the handler table from the tool
 * functions) nor the tools (which throw this to signal a refusal) has to import the other. It
 * lives in the runtime (Phase 113 Theme S) because a feature's main half carries tool
 * factories that throw it, and a feature may not import the desktop. Studio's
 * `desktop/src/main/mcp/errors.ts` re-exports it, so there is one class and `instanceof` holds.
 */
export class McpToolError extends Error {
  readonly kind: 'error' | 'not-found' | 'refused';

  constructor(kind: 'error' | 'not-found' | 'refused', message: string) {
    super(message);
    this.name = 'McpToolError';
    this.kind = kind;
  }
}
