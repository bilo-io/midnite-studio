/**
 * Thrown by a tool handler to answer with a specific `McpResponse` failure arm
 * rather than the generic `'error'` a thrown `Error` becomes in `dispatch.ts`.
 *
 * Kept in its own module (not `dispatch.ts`, not `tools.ts`) so neither of
 * those two — dispatch builds `MCP_HANDLERS` from the tool functions, the
 * tools throw this to signal a refusal — has to import the other.
 */
export class McpToolError extends Error {
  readonly kind: 'error' | 'not-found' | 'refused';

  constructor(kind: 'error' | 'not-found' | 'refused', message: string) {
    super(message);
    this.name = 'McpToolError';
    this.kind = kind;
  }
}
