import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sessionsGuestMain, shutdownGuestSessions } from '@midnite/studio-feature-sessions/main';
import { createBrokerService, createRecordingContext, createSharedBroker, writeRuntimeHostRecord } from '@midnite/studio-runtime';
import { CHANNELS, EVENT_CHANNELS, type TerminalSession } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrokerServer, type IPtyLike } from '../broker/server';

/**
 * Theme N item 3 and Theme O's Sessions, end to end on Studio's real broker server (fake ptys, sockets in
 * temp dirs — never the user's broker): Studio opens a session; Agents, a guest, starts one of its own;
 * Coder, another guest, lists both through the sessions feature's guest channels, streams and types into
 * one — and cannot end either.
 */

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

type Fake = { pty: IPtyLike; written: string[]; emit: (data: string) => void };
function fakePty(pid: number): Fake {
  let onData: ((data: string) => void) | null = null;
  let onExit: ((e: { exitCode: number }) => void) | null = null;
  const written: string[] = [];
  const pty: IPtyLike = {
    pid,
    onData: (l) => ((onData = l), {}),
    onExit: (l) => ((onExit = l), {}),
    write: (data: string) => void written.push(data),
    resize: vi.fn(),
    kill: vi.fn(() => onExit?.({ exitCode: 0 })),
  };
  return { pty, written, emit: (d) => onData?.(d) };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});

const temp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe('Coder’s Sessions over Studio’s broker — Studio’s session and Agents’', () => {
  it('lists both, titled; streams and types into Agents’ session; and ends neither', async () => {
    const studioData = temp('mbs-s-');
    const runtimeDir = temp('mbs-r-');
    const ptys = [fakePty(8001), fakePty(8002)];
    let next = 0;
    const brokerScriptPath = join(studioData, 'broker.js');
    writeFileSync(brokerScriptPath, '// stand-in\n');
    const service = createBrokerService({ dataDir: studioData, appVersion: '0.30.0', isPackaged: false, brokerScriptPath });
    const server = createBrokerServer({ socketPath: service.socketPath, userDataDir: studioData, buildId: service.buildId, spawnPty: () => ptys[next++]!.pty });
    cleanups.push(() => server.close());
    await waitFor(() => server.server.listening);
    writeRuntimeHostRecord(runtimeDir, { version: 1, host: 'studio', pid: process.pid, writtenAt: Date.now(), broker: { socketPath: service.socketPath, directory: join(studioData, 'broker') } });

    const studio = service.attach('studio');
    await studio.init();
    cleanups.push(() => studio.disconnect());
    await studio.createPty({ sessionId: 'studio-sess', cwd: studioData, cols: 80, rows: 24, env: {} });

    const agentsBroker = createSharedBroker({ runtimeDirectory: runtimeDir, appId: 'agents' });
    cleanups.push(() => agentsBroker.dispose());
    const made = await (await agentsBroker.client())!.createPty({ sessionId: 'agents-sess', cwd: studioData, cols: 80, rows: 24, env: {} });
    const agentsPty = (made as { ptyId: string }).ptyId;

    const record: TerminalSession = { id: 'studio-sess', kind: 'agent', agentId: 'claude', title: 'widgets', cwd: studioData, repoId: 'r1', createdAt: 1 };
    const ctx = createRecordingContext();
    sessionsGuestMain.register(ctx, {
      broker: createSharedBroker({ runtimeDirectory: runtimeDir, appId: 'coder' }),
      hostSessions: () => new Map([['studio-sess', record]]),
    });
    cleanups.push(() => shutdownGuestSessions());

    const list = (await ctx.invoke(CHANNELS.terminalList)) as { sessions: { session: TerminalSession; live: { ptyId: string } }[] };
    expect(list.sessions.map((s) => s.session.name ?? s.session.title)).toEqual(['widgets', 'Started by Midnite Agents']);
    expect(list.sessions[1]!.live.ptyId).toBe(agentsPty);

    await ctx.invoke(CHANNELS.ptySubscribe, { ptyId: agentsPty });
    ptys[1]!.emit('agent says hi\r\n');
    await waitFor(() => ctx.emitted.some((e) => e.channel === EVENT_CHANNELS.ptyData));
    await ctx.invoke(CHANNELS.ptyInput, { ptyId: agentsPty, data: 'y\r' });
    await waitFor(() => ptys[1]!.written.join('') === 'y\r');
    const snap = (await ctx.invoke(CHANNELS.ptySnapshot, { ptyId: agentsPty })) as { bytes: Uint8Array };
    expect(new TextDecoder().decode(snap.bytes)).toContain('agent says hi');

    // Coder registers no kill — and its guest client, asked directly, ends neither app's session.
    await expect(ctx.invoke(CHANNELS.ptyKill, { ptyId: agentsPty })).rejects.toThrow(/no handler/);
    const coderClient = (await createSharedBroker({ runtimeDirectory: runtimeDir, appId: 'coder' }).client())!;
    cleanups.push(() => coderClient.disconnect());
    await coderClient.listSessions();
    expect(await coderClient.killPty(agentsPty)).toBe(false);
    expect(server.sessionCount()).toBe(2);
  });
});
