import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` because vitest lifts `vi.mock` above the imports — the same
// `ipcMain.handle` capture `mcp-handlers.test.ts` makes.
const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

import { registerCompanionHandlers } from './companion-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw?: unknown): unknown {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

afterEach(() => {
  handle.mockClear();
});

describe('registerCompanionHandlers', () => {
  it('registers exactly the two companion channels', () => {
    registerCompanionHandlers();
    expect(handle.mock.calls.map(([channel]) => channel)).toEqual([
      CHANNELS.companionSnapshot,
      CHANNELS.companionDigest,
    ]);
  });

  it('answers an unreadable snapshot payload with the empty snapshot, not a rejection', async () => {
    registerCompanionHandlers();
    // `repoPath` is required (nullable, not optional) — a bare `{}` fails the
    // schema, and `handle` resolves with the fallback rather than rejecting.
    await expect(invoke(CHANNELS.companionSnapshot, {})).resolves.toMatchObject({
      repo: null,
      repos: 0,
      openPulls: null,
      failingChecks: null,
    });
  });

  it('answers an unreadable digest payload with an empty window', async () => {
    registerCompanionHandlers();
    const digest = (await invoke(CHANNELS.companionDigest, { repoPath: '' })) as {
      landed: unknown[];
      inProgress: unknown[];
      since: number;
    };
    expect(digest.landed).toEqual([]);
    expect(digest.inProgress).toEqual([]);
    expect(digest.since).toBeGreaterThan(0);
  });

  it('answers a snapshot with no repo named without touching a repo-scoped tool', async () => {
    registerCompanionHandlers();
    // No repo registry is configured in this test process, so `repo.list`
    // answers empty and the handler still resolves a valid snapshot.
    await expect(invoke(CHANNELS.companionSnapshot, { repoPath: null })).resolves.toMatchObject({
      repo: null,
      branch: null,
    });
  });
});
