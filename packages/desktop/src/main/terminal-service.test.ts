import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TerminalSession } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSessionHistoryStore } from './session-history-store';
import { createTerminalStore } from './terminal-store';
import {
  configureTerminals,
  forgetTerminal,
  resetTerminalsForTest,
  saveTerminal,
  shutdownTerminals,
  watchSessionExits,
  whenArchivesSettle,
} from './terminal-service';

/**
 * The pty side is a stub: this file is about what `forgetTerminal` does with a
 * session's *bytes*, and the ring buffer they come out of belongs to a service
 * that wants a broker, a node-pty binary and a BrowserWindow.
 *
 * `readScrollback` is the seam that matters — it is the live, unflushed ring,
 * and the whole ordering assertion below is that the archive contains what it
 * returns rather than what was last written to disk 15 seconds ago.
 */
/*
  `vi.hoisted`, because `vi.mock` is hoisted above the imports and its factory
  closes over both of these — a plain `const` here would still be in its
  temporal dead zone when the mocked module is first pulled in.
*/
const { ring, exitHooks } = vi.hoisted(() => ({
  ring: new Map<string, Uint8Array>(),
  exitHooks: [] as ((sessionId: string, exitCode: number) => void)[],
}));

vi.mock('./pty-service', () => ({
  activityFor: () => null,
  dropScrollback: (id: string) => {
    ring.delete(id);
  },
  livePtyFor: () => null,
  onSessionExit: (hook: (sessionId: string, exitCode: number) => void) => {
    exitHooks.push(hook);
    return () => {
      exitHooks.splice(exitHooks.indexOf(hook), 1);
    };
  },
  readScrollback: (id: string) => ring.get(id) ?? new Uint8Array(0),
  scrollbackSessionIds: () => [...ring.keys()],
  seedScrollback: () => {},
}));

let dirs: string[] = [];

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-terminal-service-'));
  dirs.push(dir);
  return dir;
};

const session = (over: Partial<TerminalSession> = {}): TerminalSession => ({
  id: 'sess-1',
  kind: 'shell',
  title: 'midnite',
  cwd: '/Users/x/Dev/midnite',
  repoId: 'repo:/Users/x/Dev/midnite',
  createdAt: 1_700_000_000_000,
  ...over,
});

/**
 * `forgetTerminal` is fire-and-forget, so the archive lands after it returns.
 *
 * Awaiting the service's own in-flight set rather than sleeping: a fixed delay
 * would be a flake on a loaded machine, and this is the same handle
 * `shutdownTerminals` uses to keep a quit from outrunning an archive.
 */
const settle = (): Promise<void> => whenArchivesSettle();

const setup = async (): Promise<{ dir: string; history: ReturnType<typeof createSessionHistoryStore> }> => {
  const dir = await tempDir();
  const history = createSessionHistoryStore(dir);
  configureTerminals(createTerminalStore(dir), dir, history);
  return { dir, history };
};

beforeEach(() => {
  ring.clear();
  exitHooks.length = 0;
});

afterEach(async () => {
  resetTerminalsForTest();
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

describe('forgetTerminal', () => {
  it('archives the bytes still in the ring, not the last flushed snapshot', async () => {
    const { dir, history } = await setup();
    saveTerminal(session());
    // Never flushed: this is output produced inside the 15s window, which is
    // exactly the part a user closes a session to read.
    ring.set('sess-1', new TextEncoder().encode('the last thing it printed\n'));

    forgetTerminal('sess-1');
    await settle();

    expect(Buffer.from(await history.transcript('sess-1')).toString()).toBe(
      'the last thing it printed\n',
    );
    // And the live copy is gone from `scrollback/` — moved, not duplicated.
    await expect(readdir(join(dir, 'scrollback'))).resolves.toEqual([]);
  });

  it('records the row with a transcript size and a closed reason', async () => {
    const { history } = await setup();
    saveTerminal(session({ name: 'build', kind: 'agent', agentId: 'claude' }));
    ring.set('sess-1', new TextEncoder().encode('abc'));

    forgetTerminal('sess-1');
    await settle();

    const [row] = await history.list();
    expect(row).toMatchObject({
      id: 'sess-1',
      name: 'build',
      agentId: 'claude',
      reason: 'closed',
      exitCode: null,
      transcriptBytes: 3,
    });
    expect(row?.closedAt).toBeGreaterThanOrEqual(row?.createdAt ?? 0);
  });

  it("reads 'exited' and the real exit code off the pty's own exit", async () => {
    const { history } = await setup();
    watchSessionExits();
    saveTerminal(session());

    for (const hook of exitHooks) hook('sess-1', 130);
    forgetTerminal('sess-1');
    await settle();

    expect(await history.list()).toMatchObject([{ reason: 'exited', exitCode: 130 }]);
  });

  it("takes 'superseded' from the caller, over any observed exit", async () => {
    const { history } = await setup();
    watchSessionExits();
    saveTerminal(session());
    for (const hook of exitHooks) hook('sess-1', 0);

    forgetTerminal('sess-1', 'superseded');
    await settle();

    expect(await history.list()).toMatchObject([{ reason: 'superseded', exitCode: 0 }]);
  });

  it('archives a silent session as a row with no transcript', async () => {
    const { dir, history } = await setup();
    saveTerminal(session());

    forgetTerminal('sess-1');
    await settle();

    expect(await history.list()).toMatchObject([{ transcriptBytes: 0 }]);
    expect(await history.transcript('sess-1')).toHaveLength(0);
    // Nothing to move means nothing was created.
    await expect(readdir(join(dir, 'session-history'))).rejects.toThrow();
  });

  it('drops the row even for a session it has no record of', async () => {
    const { history } = await setup();
    forgetTerminal('never-existed');
    await settle();
    expect(await history.list()).toEqual([]);
  });

  it('does not let a quit outrun an archive still in flight', async () => {
    const { dir, history } = await setup();
    saveTerminal(session());
    ring.set('sess-1', new TextEncoder().encode('closed, then quit\n'));

    // No `settle()`: the point is that shutdown does the waiting, because a
    // session closed a moment before the quit still has a record to write.
    forgetTerminal('sess-1');
    await shutdownTerminals();

    expect(await history.list()).toHaveLength(1);
    expect(Buffer.from(await history.transcript('sess-1')).toString()).toBe('closed, then quit\n');
    await expect(readdir(join(dir, 'scrollback'))).resolves.toEqual([]);
  });

  it('leaves the archive byte-identical to the scrollback that preceded it', async () => {
    const { dir } = await setup();
    saveTerminal(session());
    const bytes = new Uint8Array([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xff, 0x00, 0x0a]);
    ring.set('sess-1', bytes);

    forgetTerminal('sess-1');
    await settle();

    const archived = await readFile(join(dir, 'session-history', 'sess-1.bin'));
    expect(new Uint8Array(archived)).toEqual(bytes);
  });
});
