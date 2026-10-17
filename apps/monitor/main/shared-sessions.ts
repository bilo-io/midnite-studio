import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { UsageSession } from '@midnite/studio-feature-monitor/main';
import {
  createSharedBroker,
  readRuntimeHostRecord,
  type BrokerSessionInfo,
  type BrokerStatus,
  type SharedBroker,
} from '@midnite/studio-runtime';
import { TerminalSessionSchema, type schemas, type TerminalSession } from '@midnite/studio-shared';
import type { z } from 'zod';

/**
 * Monitor's Sessions, from the runtime host's broker (`docs/APPS.md`, "The shared data plane").
 *
 * Monitor owns no pty server. It attaches to the host's broker as a guest — read-only: it lists,
 * never writes, kills or starts — and titles each live session from the host's `terminals.json`
 * when the host record names it (title, agent, start time; never output). A session the file does
 * not know is shown by its working directory, as a shell, first seen now.
 */

type TerminalList = z.infer<typeof schemas.TerminalListResponse>;

/** The host's terminal records by id; empty when the file is missing or unreadable. Never throws. */
export function readHostSessions(file: string | null | undefined): Map<string, TerminalSession> {
  const out = new Map<string, TerminalSession>();
  if (!file) return out;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { sessions?: unknown };
    for (const entry of Array.isArray(raw.sessions) ? raw.sessions : []) {
      const parsed = TerminalSessionSchema.safeParse(entry);
      if (parsed.success) out.set(parsed.data.id, parsed.data);
    }
  } catch {
    // No list to title from — the broker's own facts still show.
  }
  return out;
}

/** The broker's live sessions as the `terminalList` answer Monitor's view already reads. */
export function terminalListFromShared(
  listing: { sessions: BrokerSessionInfo[]; status: BrokerStatus },
  known: Map<string, TerminalSession>,
  now: () => number = Date.now,
): TerminalList {
  return {
    broker: listing.status,
    sessions: listing.sessions.map((live) => ({
      session: known.get(live.sessionId) ?? {
        id: live.sessionId,
        kind: 'shell' as const,
        title: basename(live.cwd) || live.cwd,
        cwd: live.cwd,
        repoId: live.cwd,
        createdAt: now(),
      },
      scrollback: new Uint8Array(0),
      live: { ptyId: live.ptyId, pid: live.pid, cols: live.cols, rows: live.rows },
    })),
  };
}

/** The live agent sessions, for token spend — only those the host's list says are an agent's. */
export function usageSessionsFrom(list: TerminalList): UsageSession[] {
  return list.sessions.flatMap(({ session }) =>
    session.kind === 'agent' && session.agentId !== undefined
      ? [{ id: session.id, agentId: session.agentId, title: session.title, cwd: session.cwd, agentConversationId: session.agentConversationId }]
      : [],
  );
}

/** What Monitor's main composes: the two seams `registerMonitorHandlers` takes, over one guest. */
export function createMonitorSessions(runtimeDirectory: string): {
  listSessions: () => Promise<TerminalList>;
  agentSessions: () => Promise<UsageSession[]>;
  broker: SharedBroker;
} {
  const broker = createSharedBroker({ runtimeDirectory, appId: 'monitor' });
  const listSessions = async (): Promise<TerminalList> =>
    terminalListFromShared(await broker.listSessions(), readHostSessions(readRuntimeHostRecord(runtimeDirectory)?.sessionsFile));
  return { listSessions, agentSessions: async () => usageSessionsFrom(await listSessions()), broker };
}
