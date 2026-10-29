import type { AgentDefinition, MicrophoneAccess } from '@midnite/studio-shared';

/**
 * What the companion's main half reaches for that only the composing app owns (Phase 123 Theme F).
 *
 * The services moved out of `packages/desktop` with five reaches into it — the MCP tool dispatcher,
 * the live pty counts, the terminal service's agent roster, and two things from `electron`
 * (`safeStorage`, `utilityProcess`) plus the system's microphone verdict. Each is a field here,
 * which Studio fills from its own modules and a thinner app fills with the stubs below: no MCP
 * dispatch (so `ask` answers without tools), no ptys (counts are zero), no roster (the CLI
 * lookup finds nothing), no keychain (keys live for the session) and no TTS worker (the renderer
 * falls back to `speechSynthesis`).
 */
export type CompanionDispatchResult =
  | { ok: true; value: unknown }
  | { ok: false; kind: 'error' | 'not-found' | 'refused'; message: string };

/** The slice of Electron's `safeStorage` the STT credential file reads. */
export type CompanionSafeStorage = {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
};

export type CompanionMainServices = {
  /** The in-process MCP tool call the snapshot and digest compose (`dispatchMcpCall`). */
  dispatch: (tool: string, input: unknown) => Promise<CompanionDispatchResult>;
  /** Live terminal-session counts (`livePtyActivityCounts`). */
  sessionCounts: () => { live: number; thinking: number; waiting: number };
  /** The installed agent roster `ask` picks a CLI from (`listAgents`). */
  agents: () => Promise<AgentDefinition[]>;
  /** Electron's `safeStorage`, or null where there is no keychain. */
  safeStorage: CompanionSafeStorage | null;
  /** `utilityProcess.fork` — null where no TTS worker can be forked. */
  forkUtility: ((modulePath: string, args: string[], options: { serviceName: string; stdio: 'ignore' }) => unknown) | null;
  /** macOS's own microphone verdict (`systemPreferences.getMediaAccessStatus`). */
  microphoneAccess: () => MicrophoneAccess;
};

/** A thin app's services: nothing reachable, everything degrades to its "not available" answer. */
export const STUB_COMPANION_SERVICES: CompanionMainServices = {
  dispatch: async () => ({ ok: false, kind: 'not-found', message: 'No tools are available in this app.' }),
  sessionCounts: () => ({ live: 0, thinking: 0, waiting: 0 }),
  agents: async () => [],
  safeStorage: null,
  forkUtility: null,
  microphoneAccess: () => 'unknown',
};

let current: CompanionMainServices = STUB_COMPANION_SERVICES;

/** Set once at boot, before any handler runs. */
export function configureCompanionServices(services: CompanionMainServices): void {
  current = services;
}

export function companionServices(): CompanionMainServices {
  return current;
}

/** Test seam. */
export function resetCompanionServicesForTests(): void {
  current = STUB_COMPANION_SERVICES;
}
