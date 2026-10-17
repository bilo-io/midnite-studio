import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type { BrokerClient, BrokerSessionInfo, FeatureMainContext, SharedBroker } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, schemas, TerminalSessionSchema, type TerminalSession } from '@midnite/studio-shared';
import type { z } from 'zod';

type TerminalList = z.infer<typeof schemas.TerminalListResponse>;

/**
 * The Sessions view's channels in an app that owns no pty server (Phase 113 Theme O slice 4) — Coder.
 *
 * The app attaches to the runtime host's broker as a **guest** (`createSharedBroker`): it lists every
 * session the host's broker serves (Studio's, and any another guest app started — Agents' workflow
 * agent nodes), snapshots one, streams its output and writes keystrokes into it and resizes it. It
 * registers no `pty.create` and no `pty.kill`: this app starts nothing, so it kills nothing. The broker
 * server holds a guest to that independently (`desktop/src/broker/server.ts`).
 *
 * A session is titled from the host's own terminal records when the host names them (`hostSessions`,
 * Studio's `terminals.json` through the runtime host record) — title, agent, start time; never output,
 * never an environment. One the records do not know (another app's) is shown by its folder, labelled
 * with the app that started it. Output reaches the renderer only for a pty a window has subscribed to,
 * so a chatty session no one is looking at costs nothing here.
 */
export type GuestSessionsServices = {
  broker: SharedBroker;
  /** The host's terminal records by session id — empty when there are none to read. Never throws. */
  hostSessions: () => Map<string, TerminalSession>;
  now?: () => number;
};

/**
 * The host's terminal records by id, from the `terminals.json` the runtime host record names
 * (`sessionsFile`) — each parsed by the shared schema, so a record is a title, an agent and a start time
 * and nothing else. Empty when the file is missing or unreadable. Never throws.
 */
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

const APP_LABEL: Record<string, string> ={ agents: 'Midnite Agents', coder: 'Midnite Coder', monitor: 'Midnite Monitor' };

/** One broker session as the `terminal.list` row the Sessions view already reads. */
export function guestSessionRecord(live: BrokerSessionInfo, known: Map<string, TerminalSession>, now: number): TerminalSession {
  const recorded = known.get(live.sessionId);
  if (recorded) return recorded;
  const fromApp = live.owner !== null && live.owner !== 'studio' ? (APP_LABEL[live.owner] ?? live.owner) : null;
  return {
    id: live.sessionId,
    kind: 'shell',
    title: basename(live.cwd) || live.cwd,
    ...(fromApp ? { name: `Started by ${fromApp}` } : {}),
    cwd: live.cwd,
    repoId: live.cwd,
    createdAt: now,
  };
}

export function registerGuestSessions(ctx: FeatureMainContext, services: GuestSessionsServices): { dispose(): Promise<void> } {
  const now = services.now ?? Date.now;
  const subscribed = new Set<string>();
  const sessionOf = new Map<string, string>();
  const firstSeen = new Map<string, number>();
  let wired: BrokerClient | null = null;
  let unwire: (() => void) | null = null;

  /** The attached client, with its output and exits forwarded to the window — once per client. */
  const attached = async (): Promise<BrokerClient | null> => {
    const client = await services.broker.client();
    if (client !== wired) {
      unwire?.();
      unwire = null;
      wired = client;
      if (client) {
        const offData = client.onData((ptyId, data) => {
          if (subscribed.has(ptyId)) ctx.emit(EVENT_CHANNELS.ptyData, { ptyId, data });
        });
        const offExit = client.onExit((ptyId, exitCode, signal) => {
          subscribed.delete(ptyId);
          ctx.emit(EVENT_CHANNELS.ptyExit, { ptyId, exitCode, ...(signal === undefined ? {} : { signal }) });
        });
        unwire = () => {
          offData();
          offExit();
        };
      }
    }
    return client;
  };

  const list = async (): Promise<TerminalList> => {
    await attached();
    const listing = await services.broker.listSessions();
    const known = services.hostSessions();
    sessionOf.clear();
    return {
      broker: listing.status,
      sessions: listing.sessions.map((live) => {
        sessionOf.set(live.ptyId, live.sessionId);
        if (!firstSeen.has(live.sessionId)) firstSeen.set(live.sessionId, now());
        return {
          session: guestSessionRecord(live, known, firstSeen.get(live.sessionId) ?? now()),
          scrollback: new Uint8Array(0),
          live: { ptyId: live.ptyId, pid: live.pid, cols: live.cols, rows: live.rows },
          ...(live.legacy ? { legacy: true } : {}),
        };
      }),
    };
  };

  const warn = () => undefined;
  ctx.ipc.handleBare(CHANNELS.terminalList, list);
  ctx.ipc.handle(
    CHANNELS.ptySnapshot,
    schemas.PtySnapshotRequest,
    async ({ ptyId }) => {
      const client = await attached();
      const sessionId = sessionOf.get(ptyId);
      if (!client || sessionId === undefined) return { bytes: new Uint8Array(0) };
      return { bytes: await client.snapshot(sessionId) };
    },
    () => ({ bytes: new Uint8Array(0) }),
  );
  // Input goes only to a session the last listing named: a guest writes into what it can see.
  ctx.ipc.send(CHANNELS.ptyInput, schemas.PtyInputRequest, ({ ptyId, data }) => {
    if (sessionOf.has(ptyId)) wired?.writePty(ptyId, data);
  }, warn);
  ctx.ipc.send(CHANNELS.ptyResize, schemas.PtyResizeRequest, ({ ptyId, cols, rows }) => {
    if (sessionOf.has(ptyId)) void wired?.resizePty(ptyId, cols, rows);
  }, warn);
  ctx.ipc.send(CHANNELS.ptySubscribe, schemas.PtySubscribeRequest, ({ ptyId }) => void subscribed.add(ptyId), warn);
  ctx.ipc.send(CHANNELS.ptyUnsubscribe, schemas.PtyUnsubscribeRequest, ({ ptyId }) => void subscribed.delete(ptyId), warn);

  return {
    dispose: async () => {
      unwire?.();
      await services.broker.dispose();
    },
  };
}
