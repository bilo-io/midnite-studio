import { describe, expect, it, vi, beforeEach } from 'vitest';

import { reconcileWatchers, stopAllWatchers, watcherCount } from './watch-service';

const mocks = vi.hoisted(() => ({
  sent: [] as Array<{ channel: string; payload: unknown }>,
  started: [] as Array<{ repoId: string; repoPath: string }>,
  stopped: [] as string[],
  emitters: new Map<string, (kind: string) => void>(),
}));

vi.mock('./window-manager', () => ({
  broadcastToAllWindows: (channel: string, payload: unknown) => {
    mocks.sent.push({ channel, payload });
  },
}));

vi.mock('@midnite/studio-git-engine', () => ({
  RepoWatcher: {
    start: async ({
      repoId,
      repoPath,
      onEvent,
    }: {
      repoId: string;
      repoPath: string;
      onEvent: (kind: string) => void;
    }) => {
      mocks.started.push({ repoId, repoPath });
      mocks.emitters.set(repoId, onEvent);
      return {
        stop: () => {
          mocks.stopped.push(repoId);
          mocks.emitters.delete(repoId);
        },
      };
    },
  },
}));

const repo = (id: string) => ({ id, path: `/tmp/${id}` });

describe('watch-service — one watcher, N consumers (Theme I)', () => {
  beforeEach(() => {
    stopAllWatchers();
    mocks.sent.length = 0;
    mocks.started.length = 0;
    mocks.stopped.length = 0;
  });

  /*
    The cost bound the fan-out design rests on. Watchers stay keyed by repoId,
    so opening a repo in a second window costs another `webContents.send` per
    event and NOT another recursive fs tree — the thing a literal
    watcher-per-window would have bought.
  */
  it('starts exactly one watcher per repo, however many windows are open', async () => {
    await reconcileWatchers([repo('a'), repo('b')]);
    await reconcileWatchers([repo('a'), repo('b')]);

    expect(mocks.started.map((s) => s.repoId)).toEqual(['a', 'b']);
    expect(watcherCount()).toBe(2);
  });

  it('fans each event out rather than sending it to one captured window', async () => {
    await reconcileWatchers([repo('a')]);

    mocks.emitters.get('a')?.('refs');

    expect(mocks.sent).toHaveLength(1);
    expect(mocks.sent[0]?.payload).toMatchObject({ repoId: 'a', kind: 'refs' });
  });

  it('stops the watcher for a repo that left the registry', async () => {
    await reconcileWatchers([repo('a'), repo('b')]);
    await reconcileWatchers([repo('a')]);

    expect(mocks.stopped).toEqual(['b']);
    expect(watcherCount()).toBe(1);
  });

  it('emits nothing once every watcher is stopped', async () => {
    await reconcileWatchers([repo('a')]);
    const emit = mocks.emitters.get('a');
    stopAllWatchers();
    mocks.sent.length = 0;

    emit?.('worktree');
    expect(watcherCount()).toBe(0);
  });
});
