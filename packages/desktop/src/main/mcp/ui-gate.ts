/**
 * The `allowUi` flag, in memory — read by `tools.ts`'s `ui.navigate`/
 * `ui.command` handlers on every call, written by `main/mcp/index.ts`'s
 * `setMcpAllowUi` (which owns persisting it through `mcp-store.ts`).
 *
 * Split into its own module rather than living on `main/mcp/index.ts`
 * directly: `index.ts` sits above `server.ts` → `dispatch.ts` → `tools.ts`
 * in this package's own call graph, so a `tools.ts` import of `index.ts`
 * would close that into a cycle. Neither file imports the other here —
 * both import this one, which imports nothing.
 */

let allowUi = false;

/** Read synchronously by `tools.ts`'s `ui.navigate`/`ui.command` handlers before doing anything else — the gate that must run before any IPC is sent. */
export function getMcpAllowUi(): boolean {
  return allowUi;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowUiState(next: boolean): void {
  allowUi = next;
}

/** Test-only: module state otherwise survives across a suite's test cases. */
export function resetMcpAllowUiStateForTests(): void {
  allowUi = false;
}
