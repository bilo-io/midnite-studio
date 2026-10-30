import type { BrokerClient } from '@midnite/studio-runtime';
import type { RuntimeWindow } from '@midnite/studio-runtime';

import type { agentKeyEnv } from './pty-env';

/**
 * What the pty service needs from its composer (Phase 123 Theme E.3). It may not import `electron`,
 * `node-pty`, the window manager, confinement or the secrets vault, so each arrives here; desktop's
 * `pty-service.ts` shim binds them once.
 */

/** An agent watcher, structurally (desktop's `agent-watcher.ts`). */
export type PtyAgentWatcher = {
  track: (ptyId: string, pid: number, declaredAgentId: string | null) => void;
  noteOutput: (ptyId: string) => void;
  untrack: (ptyId: string) => void;
  currentAgentId: (ptyId: string) => string | null;
};

export type PtyConfinePrepared = { ok: true; profile: string; release: () => void } | { ok: false; message: string };

export type PtyConfinementPort = {
  prepare(sessionId: string, cwd: string, requested?: boolean): Promise<PtyConfinePrepared | null>;
  track(sessionId: string, pid: number): void;
};

export type PtyCreateOptions = {
  sessionId: string;
  kind?: string | undefined;
  cwd: string;
  cols: number;
  rows: number;
  agentId?: string | undefined;
  initialInput?: string | undefined;
  env?: Record<string, string> | undefined;
  confine?: { profile: string } | undefined;
};

/** The in-process (`node-pty`) fallback, which stays in `packages/desktop`. */
export type InprocPtyPort = {
  isPidAlive(pid: number): boolean;
  setAgentWatcher(watcher: PtyAgentWatcher | null): void;
  readScrollback(sessionId: string): Uint8Array;
  seedScrollback(sessionId: string, bytes: Uint8Array): void;
  scrollbackSessionIds(): string[];
  dropScrollback(sessionId: string): void;
  createPty(
    options: PtyCreateOptions,
    onData: (ptyId: string, bytes: Uint8Array) => void,
    onExit: (ptyId: string, exitCode: number, signal?: number | undefined) => void,
  ): { ok: true; ptyId: string; pid?: number } | { ok: false; message: string };
  writePty(ptyId: string, data: string): void;
  resizePty(ptyId: string, cols: number, rows: number): void;
  sessionIdFor(ptyId: string): string | undefined;
  livePtyFor(sessionId: string): { ptyId: string; pid: number; cols: number; rows: number; legacy: boolean } | null;
  killPty(ptyId: string): void;
  killAllPtys(): void;
  activePtyPids(): number[];
  ptySessionOwners(): Map<number, string>;
  ptySessionCount(): number;
};

export type PtyBrokerDeps = {
  userDataDir: string;
  appVersion: string;
  isPackaged: boolean;
  log?: (message: string) => void;
};

export type PtyPorts = {
  /** The main window and a lookup by id, for the per-window output subscriptions. */
  windows: { main(): RuntimeWindow | null; fromId(id: number): RuntimeWindow | null };
  confinement(): PtyConfinementPort | null;
  readAgentApiKey: Parameters<typeof agentKeyEnv>[3];
  readOllamaApiKey(): Promise<string | null>;
  inproc: InprocPtyPort;
  broker: {
    create(deps: PtyBrokerDeps): BrokerClient;
    location(deps: PtyBrokerDeps): { socketPath: string; directory: string };
  };
};
