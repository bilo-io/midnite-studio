// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TerminalSession } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTerminalStore } from './terminal-store';
import {
  configureTerminals,
  endPreviousBuildSessions,
  endSessions,
  forgetTerminal,
  listTerminals,
  recoverDetachedSessions,
  recoveredSession,
  resetTerminalsForTest,
  saveTerminal,
  setTerminalPorts,
  shutdownTerminals,
  whenArchivesSettle,
  type TerminalPtyPort,
} from './terminal-service';

/**
 * Detached sessions (2026-11-14): six agent ptys kept running in two retired brokers with no row in
 * `terminals.json`, so nothing listed them. These pin both halves of the fix — a list that is never saved
 * before it is loaded, and a live pty with no row getting one back.
 */
type LivePty = ReturnType<NonNullable<TerminalPtyPort['liveBrokerSessions']>>[number];

const { live, rescan, killed } = vi.hoisted(() => ({
  live: [] as LivePty[],
  /** Brokers a rescan "finds" — moved into `live` when it runs. */
  rescan: [] as LivePty[],
  killed: [] as string[],
}));

setTerminalPorts({
  pty: {
    activityFor: () => null,
    dropScrollback: () => {},
    liveBrokerSessions: () => live,
    rescanBrokerSessions: async () => {
      live.push(...rescan.splice(0));
    },
    killPty: (ptyId) => {
      killed.push(ptyId);
      const index = live.findIndex((p) => p.ptyId === ptyId);
      if (index !== -1) live.splice(index, 1);
    },
    livePtyFor: (sessionId) => {
      const pty = live.find((p) => p.sessionId === sessionId);
      return pty ? { ptyId: pty.ptyId, pid: pty.pid, cols: pty.cols, rows: pty.rows, legacy: pty.legacy } : null;
    },
    onSessionExit: () => () => {},
    readScrollback: () => new Uint8Array(0),
    scrollbackSessionIds: () => [],
    seedScrollback: () => {},
  },
  locateAgentConversation: async () => null,
  log: () => {},
});

let dirs: string[] = [];

const row = (id: string, over: Partial<TerminalSession> = {}): TerminalSession => ({
  id,
  kind: 'shell',
  title: 'midnite',
  cwd: '/Users/x/Dev/midnite',
  repoId: 'repo:/Users/x/Dev/midnite',
  createdAt: 1_700_000_000_000,
  ...over,
});

const pty = (sessionId: string, over: Partial<LivePty> = {}): LivePty => ({
  sessionId,
  ptyId: `pty-${sessionId}`,
  pid: 4242,
  cols: 80,
  rows: 24,
  cwd: '/Users/x/Dev/bilo',
  legacy: true,
  owner: 'studio',
  ...over,
});

/** A data dir whose `terminals.json` already holds `rows`, as a previous launch left it. */
const seeded = async (rows: TerminalSession[]): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-terminal-recovery-'));
  dirs.push(dir);
  await writeFile(join(dir, 'terminals.json'), JSON.stringify({ version: 1, sessions: rows }));
  configureTerminals(createTerminalStore(dir), dir);
  return dir;
};

const savedIds = async (dir: string): Promise<string[]> =>
  (JSON.parse(await readFile(join(dir, 'terminals.json'), 'utf8')) as { sessions: TerminalSession[] }).sessions.map(
    (s) => s.id,
  );

beforeEach(() => {
  live.length = 0;
  rescan.length = 0;
  killed.length = 0;
});

afterEach(async () => {
  await whenArchivesSettle();
  resetTerminalsForTest();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('the saved list is never written before it is loaded', () => {
  it('keeps every saved row when the app quits without ever listing', async () => {
    const dir = await seeded([row('a'), row('b')]);
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['a', 'b']);
  });

  it('merges a save that beats the first list instead of replacing the file with it', async () => {
    const dir = await seeded([row('a'), row('b')]);
    saveTerminal(row('c'));
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['a', 'b', 'c']);
  });

  it('lets an update made before the load win over its saved copy', async () => {
    const dir = await seeded([row('a', { name: 'old' })]);
    saveTerminal(row('a', { name: 'new' }));
    const sessions = await listTerminals();
    expect(sessions.map((s) => s.session.name)).toEqual(['new']);
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['a']);
  });

  it('does not bring back a row forgotten before the load', async () => {
    const dir = await seeded([row('a'), row('b')]);
    forgetTerminal('a');
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['b']);
  });

  it('does not reload the file once every session has been closed', async () => {
    const dir = await seeded([row('a')]);
    await listTerminals();
    forgetTerminal('a');
    expect(await listTerminals()).toEqual([]);
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual([]);
  });
});

describe('a live broker pty with no saved row', () => {
  it('lists with a recovered row, bound live and marked legacy', async () => {
    await seeded([row('a')]);
    live.push(pty('orphan', { cwd: '/Users/x/Dev/bilo' }));

    const sessions = await listTerminals();

    expect(sessions.map((s) => s.session.id)).toEqual(['a', 'orphan']);
    const recovered = sessions[1]!;
    expect(recovered.session).toMatchObject({
      kind: 'shell',
      title: 'bilo',
      cwd: '/Users/x/Dev/bilo',
      repoId: 'repo:/Users/x/Dev/bilo',
    });
    expect(recovered.live?.ptyId).toBe('pty-orphan');
    expect(recovered.legacy).toBe(true);
  });

  it('falls back to the home folder when the broker reported no cwd', async () => {
    await seeded([]);
    live.push(pty('no-cwd', { cwd: '' }));
    const [recovered] = await listTerminals();
    expect(recovered?.session.cwd).toBe(homedir());
    expect(recovered?.session.repoId).toBe(`repo:${homedir()}`);
  });

  it('persists the recovered row so the next launch still has it', async () => {
    const dir = await seeded([]);
    live.push(pty('orphan'));
    await listTerminals();
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['orphan']);
  });

  it('recovers each pty once, however often the list is read', async () => {
    await seeded([]);
    live.push(pty('orphan'));
    await listTerminals();
    expect((await listTerminals()).map((s) => s.session.id)).toEqual(['orphan']);
  });

  it('leaves a pty that already has a row alone', async () => {
    await seeded([row('a', { name: 'mine' })]);
    live.push(pty('a', { legacy: false }));
    const sessions = await listTerminals();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.session.name).toBe('mine');
    expect(sessions[0]?.legacy).toBeUndefined();
  });
});

describe('recoveredSession', () => {
  it("stamps another app's session as that app's", () => {
    expect(recoveredSession('s', '/x', 'agents', 1).appId).toBe('agents');
  });

  it('leaves a Studio-owned or ownerless session unstamped', () => {
    expect(recoveredSession('s', '/x', 'studio', 1).appId).toBeUndefined();
    expect(recoveredSession('s', '/x', null, 1).appId).toBeUndefined();
    expect(recoveredSession('s', '/x', 'not-an-app', 1).appId).toBeUndefined();
  });
});

describe('recoverDetachedSessions', () => {
  it('adopts brokers found since boot and returns the recovered rows with totals', async () => {
    const dir = await seeded([row('a')]);
    live.push(pty('a', { legacy: false }));
    rescan.push(pty('late-1', { cwd: '/Users/x/Dev/bilo' }), pty('late-2', { cwd: '/Users/x/Dev/midnite' }));

    const result = await recoverDetachedSessions();

    expect(result.recovered).toEqual([
      { sessionId: 'late-1', title: 'bilo', cwd: '/Users/x/Dev/bilo', repoId: 'repo:/Users/x/Dev/bilo', legacy: true },
      { sessionId: 'late-2', title: 'midnite', cwd: '/Users/x/Dev/midnite', repoId: 'repo:/Users/x/Dev/midnite', legacy: true },
    ]);
    expect(result).toMatchObject({ live: 3, previousBuild: 2 });
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['a', 'late-1', 'late-2']);
  });

  it('recovers nothing twice', async () => {
    await seeded([]);
    live.push(pty('orphan'));
    expect((await recoverDetachedSessions()).recovered).toHaveLength(1);
    expect((await recoverDetachedSessions()).recovered).toHaveLength(0);
  });
});

describe('endSessions / endPreviousBuildSessions', () => {
  it('kills each live pty and removes its row', async () => {
    const dir = await seeded([row('a'), row('b')]);
    live.push(pty('a'));
    expect(await endSessions(['a', 'b', 'unknown'])).toEqual(['a', 'b']);
    expect(killed).toEqual(['pty-a']);
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual([]);
  });

  it('ends only the previous-build sessions', async () => {
    const dir = await seeded([row('mine'), row('old')]);
    live.push(pty('mine', { legacy: false }), pty('old', { legacy: true }), pty('orphan-old', { legacy: true }));
    await listTerminals();

    expect((await endPreviousBuildSessions()).sort()).toEqual(['old', 'orphan-old']);
    expect(killed.sort()).toEqual(['pty-old', 'pty-orphan-old']);
    await shutdownTerminals();
    expect(await savedIds(dir)).toEqual(['mine']);
  });

  it('is a no-op when no previous-build session runs', async () => {
    await seeded([row('mine')]);
    live.push(pty('mine', { legacy: false }));
    expect(await endPreviousBuildSessions()).toEqual([]);
    expect(killed).toEqual([]);
  });
});
