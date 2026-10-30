// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRecordingContext } from '@midnite/studio-runtime';
import { CHANNELS } from '@midnite/studio-shared';

import { terminalMain, type TerminalMainServices } from './index';
import type { PtyPorts } from './pty-ports';
import { setPtyPorts, subscribersFor } from './pty-service';
import { setTerminalPorts } from './terminal-service';

setTerminalPorts({
  pty: {
    activityFor: () => null,
    dropScrollback: () => {},
    livePtyFor: () => null,
    onSessionExit: () => () => {},
    readScrollback: () => new Uint8Array(0),
    scrollbackSessionIds: () => [],
    seedScrollback: () => {},
  },
  locateAgentConversation: async () => null,
  log: () => {},
});

const services = (over: Partial<TerminalMainServices> = {}): TerminalMainServices => ({
  brokerStatus: () => ({ mode: 'inproc', reason: 'test' }),
  agentProbe: () => ({ started: () => true, start: async () => undefined, snapshot: () => ({ probe: 'checking' }) }),
  ...over,
});

describe('terminal main', () => {
  it('registers the invoke channels it promises', () => {
    const ctx = createRecordingContext();
    terminalMain.register(ctx, services());
    for (const channel of terminalMain.channels) expect(ctx.channels, channel).toContain(channel);
  });

  it('answers the list with the broker status the composer reports', async () => {
    const ctx = createRecordingContext();
    terminalMain.register(ctx, services());
    const answer = (await ctx.invoke(CHANNELS.terminalList)) as { sessions: unknown[]; broker: unknown };
    expect(answer.broker).toEqual({ mode: 'inproc', reason: 'test' });
    expect(Array.isArray(answer.sessions)).toBe(true);
  });

  it('starts the probe on a roster request when nothing has probed yet, without waiting on it', async () => {
    const ctx = createRecordingContext();
    const start = vi.fn(() => new Promise<void>(() => {}));
    terminalMain.register(ctx, services({ agentProbe: () => ({ started: () => false, start, snapshot: () => ({ probe: 'checking' }) }) }));
    const answer = (await ctx.invoke(CHANNELS.agentList)) as { agents: unknown[]; probe: string };
    expect(start).toHaveBeenCalledTimes(1);
    expect(answer.probe).toBe('checking');
    expect(Array.isArray(answer.agents)).toBe(true);
  });

  it('forces a re-probe on recheck, and reports a bad one-way payload instead of throwing', async () => {
    const ctx = createRecordingContext();
    const start = vi.fn(async () => undefined);
    const warn = vi.fn();
    terminalMain.register(ctx, services({ agentProbe: () => ({ started: () => true, start, snapshot: () => ({}) }), warn }));
    await ctx.invoke(CHANNELS.agentRecheck);
    expect(start).toHaveBeenCalledWith({ force: true });
    await ctx.invoke(CHANNELS.terminalSave, { session: 'nope' });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('registers the sender-aware pty channels and hands the sending window to subscribe', async () => {
    const ctx = createRecordingContext();
    terminalMain.register(ctx, services());
    expect(ctx.channels).toEqual(
      expect.arrayContaining([
        CHANNELS.ptyCreate,
        CHANNELS.ptyInput,
        CHANNELS.ptyResize,
        CHANNELS.ptyKill,
        CHANNELS.ptySnapshot,
        CHANNELS.ptySubscribe,
        CHANNELS.ptyUnsubscribe,
      ]),
    );
    const win = { id: 7, isDestroyed: () => false, once: vi.fn(), webContents: { send: vi.fn() } };
    setPtyPorts({ windows: { main: () => null, fromId: () => win } } as unknown as PtyPorts);
    await ctx.invoke(CHANNELS.ptySubscribe, { ptyId: 'p-sub' }, win);
    expect(subscribersFor('p-sub').map((w) => w.id)).toEqual([7]);
    await ctx.invoke(CHANNELS.ptyUnsubscribe, { ptyId: 'p-sub' }, win);
    expect(subscribersFor('p-sub')).toEqual([]);
    setPtyPorts(null);
  });

  it('refuses an ipc without sendFromSender rather than leaving popouts silently dead', () => {
    const ctx = createRecordingContext();
    const bare = { ...ctx, ipc: { handle: ctx.ipc.handle, handleBare: ctx.ipc.handleBare, send: ctx.ipc.send } };
    expect(() => terminalMain.register(bare, services())).toThrow(/sendFromSender/);
    // The guard runs first: nothing was registered before it threw.
    expect(ctx.channels).toEqual([]);
  });
});
