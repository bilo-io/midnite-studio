import type { PlacementAppId } from './domain/placement';

/**
 * The suite apps that can serve MCP on a socket of their own (Phase 153 Theme B), each with the display
 * name its `main/identity.ts` carries (`apps/<id>/main/identity.ts`). One table, so the `midnite` shim —
 * a plain-node process that cannot ask a running app anything — finds each app's data directory by name.
 *
 * Studio is not in it: its socket and listing stay the shim's default path, unchanged.
 */
export const SUITE_APP_DISPLAY_NAMES = {
  agents: 'Midnite Agents',
  browser: 'Midnite Browser',
  gamer: 'Midnite Gamer',
  health: 'Midnite Health',
  media: 'Midnite Media',
  mind: 'Midnite Mind',
  money: 'Midnite Money',
  science: 'Midnite Science',
  startup: 'Midnite Startup',
  vanguard: 'Midnite Vanguard',
} as const satisfies Partial<Record<PlacementAppId, string>>;

export type SuiteMcpAppId = keyof typeof SUITE_APP_DISPLAY_NAMES;

/** Studio's display name — what the shim's default `resolveUserDataDir()` already assumes. */
export const STUDIO_DISPLAY_NAME = 'Midnite Studio';

/** The reserved tool name the shim's list request goes out under; `startAppMcpServer` answers it with its tool ids. */
export const MCP_LIST_TOOLS_REQUEST = 'tools/list';
