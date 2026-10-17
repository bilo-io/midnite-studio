// @vitest-environment node
import { createRecordingContext, type BrokerClient, type BrokerSessionInfo, type SharedBroker } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, type TerminalSession } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import { sessionsManifest } from '../manifest';
import { registerGuestSessions } from './guest-sessions';
import { sessionsGuestMain, shutdownGuestSessions } from './index';

/** A guest client over nothing: what the test drives instead of a broker socket. */
function fakeBroker(sessions: BrokerSessionInfo[]) {
  let onData: ((ptyId: string, bytes: Uint8Array) => void) | null = null;
  let onExit: ((ptyId: string, code: number) => void) | null = null;
  const client = {
    onData: (l: typeof onData) => ((onData = l), () => (onData = null)),
    onExit: (l: typeof onExit) => ((onExit = l), () => (onExit = null)),
    writePty: vi.fn(),
    resizePty: vi.fn(async () => true),
    snapshot: vi.fn(async (sessionId: string) => new TextEncoder().encode(`scrollback of ${sessionId}`)),
    createPty: vi.fn(),
    killPty: vi.fn(),
  } as unknown as BrokerClient;
  const broker: SharedBroker = {
    client: async () => client,
    listSessions: async () => ({ sessions, status: { mode: 'broker' } }),
    dispose: vi.fn(async () => undefined),
  };
  return { broker, client, data: (ptyId: string, text: string) => onData?.(ptyId, new TextEncoder().encode(text)), exit: (ptyId: string) => onExit?.(ptyId, 0) };
}

const live = (sessionId: string, owner: string | null, cwd = '/work/widgets'): BrokerSessionInfo => ({
  ptyId: `p-${sessionId}`,
  sessionId,
  pid: 42,
  cols: 80,
  rows: 24,
  cwd,
  legacy: false,
  owner,
});

const studioRecord: TerminalSession = { id: 's1', kind: 'agent', agentId: 'claude', title: 'widgets', cwd: '/w', repoId: 'r1', createdAt: 1000 };

describe('guest sessions — the host’s sessions, from an app with no pty server', () => {
  it('registers exactly the manifest’s channels — no create, no kill', () => {
    const ctx = createRecordingContext();
    sessionsGuestMain.register(ctx, { broker: fakeBroker([]).broker, hostSessions: () => new Map() });
    expect([...ctx.channels].sort()).toEqual([...sessionsManifest.ipc, ...sessionsManifest.sends].sort());
    expect(ctx.channels).not.toContain(CHANNELS.ptyCreate);
    expect(ctx.channels).not.toContain(CHANNELS.ptyKill);
    return shutdownGuestSessions();
  });

  it('lists the host’s sessions titled from its records, and another app’s by folder and app', async () => {
    const ctx = createRecordingContext();
    const { broker } = fakeBroker([live('s1', 'studio'), live('a1', 'agents')]);
    registerGuestSessions(ctx, { broker, hostSessions: () => new Map([['s1', studioRecord]]), now: () => 5000 });
    const list = (await ctx.invoke(CHANNELS.terminalList)) as { sessions: { session: TerminalSession; live: { ptyId: string } }[] };
    expect(list.sessions.map((s) => s.session)).toEqual([
      studioRecord,
      { id: 'a1', kind: 'shell', title: 'widgets', name: 'Started by Midnite Agents', cwd: '/work/widgets', repoId: '/work/widgets', createdAt: 5000 },
    ]);
    expect(list.sessions[1]!.live.ptyId).toBe('p-a1');
  });

  it('snapshots, writes and resizes only a session it has listed, and streams only what a window subscribed to', async () => {
    const ctx = createRecordingContext();
    const fake = fakeBroker([live('s1', 'studio')]);
    registerGuestSessions(ctx, { broker: fake.broker, hostSessions: () => new Map() });
    await ctx.invoke(CHANNELS.ptyInput, { ptyId: 'p-s1', data: 'early' });
    expect(fake.client.writePty).not.toHaveBeenCalled();

    await ctx.invoke(CHANNELS.terminalList);
    const snap = (await ctx.invoke(CHANNELS.ptySnapshot, { ptyId: 'p-s1' })) as { bytes: Uint8Array };
    expect(new TextDecoder().decode(snap.bytes)).toBe('scrollback of s1');
    await ctx.invoke(CHANNELS.ptyInput, { ptyId: 'p-s1', data: 'ls\r' });
    await ctx.invoke(CHANNELS.ptyInput, { ptyId: 'p-unknown', data: 'rm -rf\r' });
    expect(fake.client.writePty).toHaveBeenCalledTimes(1);
    expect(fake.client.writePty).toHaveBeenCalledWith('p-s1', 'ls\r');
    await ctx.invoke(CHANNELS.ptyResize, { ptyId: 'p-s1', cols: 100, rows: 30 });
    expect(fake.client.resizePty).toHaveBeenCalledWith('p-s1', 100, 30);

    fake.data('p-s1', 'unwatched');
    await ctx.invoke(CHANNELS.ptySubscribe, { ptyId: 'p-s1' });
    fake.data('p-s1', 'watched');
    fake.exit('p-s1');
    expect(ctx.emitted.map((e) => e.channel)).toEqual([EVENT_CHANNELS.ptyData, EVENT_CHANNELS.ptyExit]);
    expect(new TextDecoder().decode((ctx.emitted[0]!.payload as { data: Uint8Array }).data)).toBe('watched');
    expect(fake.client.createPty).not.toHaveBeenCalled();
    expect(fake.client.killPty).not.toHaveBeenCalled();
  });

  it('answers an empty list when no host broker is running', async () => {
    const ctx = createRecordingContext();
    const broker: SharedBroker = {
      client: async () => null,
      listSessions: async () => ({ sessions: [], status: { mode: 'inproc', reason: 'no shared terminal broker is running' } }),
      dispose: async () => undefined,
    };
    registerGuestSessions(ctx, { broker, hostSessions: () => new Map() });
    expect(await ctx.invoke(CHANNELS.terminalList)).toEqual({ broker: { mode: 'inproc', reason: 'no shared terminal broker is running' }, sessions: [] });
    expect(await ctx.invoke(CHANNELS.ptySnapshot, { ptyId: 'p-x' })).toEqual({ bytes: new Uint8Array(0) });
  });
});
