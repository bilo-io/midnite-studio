/**
 * The `allowUi`/`allowGateDecide` flags, in memory — read by `tools.ts`'s
 * `ui.navigate`/`ui.command`/`workflow_gate_decide` handlers on every call,
 * written by `main/mcp/index.ts`'s `setMcpAllowUi`/`setMcpAllowGateDecide`
 * (which own persisting each through `mcp-store.ts`).
 *
 * Split into its own module rather than living on `main/mcp/index.ts`
 * directly: `index.ts` sits above `server.ts` → `dispatch.ts` → `tools.ts`
 * in this package's own call graph, so a `tools.ts` import of `index.ts`
 * would close that into a cycle. Neither file imports the other here —
 * both import this one, which imports nothing.
 */

let allowUi = false;
let allowGateDecide = false;
let allowModels = false;
let allowGames = false;
let allowTerrains = false;
let allowSprites = false;
let allowMaps = false;
let allowMusic = false;
let allowCompanionSettings = false;

/** Read synchronously by `tools.ts`'s `ui.navigate`/`ui.command` handlers before doing anything else — the gate that must run before any IPC is sent. */
export function getMcpAllowUi(): boolean {
  return allowUi;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowUiState(next: boolean): void {
  allowUi = next;
}

/** Read synchronously by `tools.ts`'s `workflow_gate_decide` handler (Phase 97 Theme D) — the gate that must run before any workflow state changes. */
export function getMcpAllowGateDecide(): boolean {
  return allowGateDecide;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowGateDecideState(next: boolean): void {
  allowGateDecide = next;
}

/** Read synchronously by the `model_*` write tools (Phase 99 Theme G) before they touch a model. */
export function getMcpAllowModels(): boolean {
  return allowModels;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowModelsState(next: boolean): void {
  allowModels = next;
}

/** Read synchronously by the `game_*` write tools (Phase 107 Theme D) before they create, run or drive a game. */
export function getMcpAllowGames(): boolean {
  return allowGames;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowGamesState(next: boolean): void {
  allowGames = next;
}

/** Read synchronously by the `terrain_*` write tools (Phase 105 Theme J) before they touch a terrain. */
export function getMcpAllowTerrains(): boolean {
  return allowTerrains;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowTerrainsState(next: boolean): void {
  allowTerrains = next;
}

/** Read synchronously by the sprite write tools (Phase 106 Theme K) before they change an asset, start a job or export. */
export function getMcpAllowSprites(): boolean {
  return allowSprites;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowSpritesState(next: boolean): void {
  allowSprites = next;
}

/** Read synchronously by `map_goto` and `map_capture_terrain` (Phase 108 Theme I) before they move the view or capture. */
export function getMcpAllowMaps(): boolean {
  return allowMaps;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowMapsState(next: boolean): void {
  allowMaps = next;
}

/** Read synchronously by the `music_*` write tools (Phase 101 Theme H) before they change, add or save a song. */
export function getMcpAllowMusic(): boolean {
  return allowMusic;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowMusicState(next: boolean): void {
  allowMusic = next;
}

/** Read synchronously by every `companion_*` tool (Phase 109 Theme D) — reads included — before any IPC is sent. */
export function getMcpAllowCompanionSettings(): boolean {
  return allowCompanionSettings;
}

/** Written by `main/mcp/index.ts` after `mcp-store.ts` has persisted the new value. */
export function setMcpAllowCompanionSettingsState(next: boolean): void {
  allowCompanionSettings = next;
}

/** Test-only: module state otherwise survives across a suite's test cases. */
export function resetMcpAllowUiStateForTests(): void {
  allowUi = false;
  allowGateDecide = false;
  allowModels = false;
  allowGames = false;
  allowTerrains = false;
  allowSprites = false;
  allowMaps = false;
  allowMusic = false;
  allowCompanionSettings = false;
}
