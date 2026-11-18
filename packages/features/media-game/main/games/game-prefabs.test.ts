// @vitest-environment node
import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { TempRepo } from '@midnite/studio-git-engine';
import { EVENT_CHANNELS, type GameSummary } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { createGamePrefabs } from './game-prefabs';

const prefab = (name: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  name,
  dimension: '3d',
  objects: [{ type: 'prop', x: -10, y: 0, properties: { model: 'tree' } }, { type: 'prop', x: 10, y: 0 }],
  ...extra,
});

describe('createGamePrefabs (Phase 139 Theme F)', () => {
  let repo: TempRepo;
  let game: GameSummary;
  let send: Mock<(channel: string, payload: unknown) => void>;
  let prefabs: ReturnType<typeof createGamePrefabs>;

  beforeEach(async () => {
    repo = await TempRepo.create();
    await repo.writeFile('src/main.js', 'console.log(1);');
    await repo.git(['add', '.']);
    await repo.git(['commit', '-m', 'Initial commit']);
    game = { gameId: 'g1', name: 'G', path: repo.path, engine: 'phaser', dimension: '3d', starter: 'blank', dirty: false, valid: true, issue: null, status: null, findingCount: 0 };
    send = vi.fn<(channel: string, payload: unknown) => void>();
    prefabs = createGamePrefabs({
      resolve: async (id) => (id === 'g1' ? game : null),
      send,
      log: Object.assign(vi.fn(), { info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    });
  });
  afterEach(async () => {
    await repo.cleanup();
  });

  it('F1 set then list round-trips; the commit touches only the prefab file', async () => {
    await repo.writeFile('unrelated.txt', 'dirty');
    await repo.git(['add', 'unrelated.txt']);
    const set = await prefabs.set('g1', prefab('grove', { description: 'Two trees' }));
    expect(set.ok).toBe(true);
    const listed = await prefabs.list('g1');
    expect(listed).toEqual({ ok: true, value: { prefabs: [{ name: 'grove', dimension: '3d', objects: 2, description: 'Two trees' }] } });
    const files = (await repo.git(['show', '--name-only', '--format=', 'HEAD'])).trim();
    expect(files).toBe('levels/prefabs/grove.prefab.json');
    expect((await repo.git(['log', '-1', '--format=%s'])).trim()).toBe('Save prefab grove');
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.gamesChanged, { reason: 'level' });
    const got = await prefabs.get('g1', 'grove');
    expect(got.ok && got.value.prefab.objects).toHaveLength(2);
  });

  it('F1 lists sorted by name, and a malformed file lists with objects 0 and an issue', async () => {
    await prefabs.set('g1', prefab('zeta'));
    await prefabs.set('g1', prefab('alpha'));
    await repo.writeFile('levels/prefabs/broken.prefab.json', '{"version":1,"name":"broken","dimension":"2d","objects":[]}');
    const listed = await prefabs.list('g1');
    expect(listed.ok && listed.value.prefabs.map((p) => p.name)).toEqual(['alpha', 'broken', 'zeta']);
    const broken = listed.ok ? listed.value.prefabs[1]! : null;
    expect(broken).toMatchObject({ objects: 0 });
    expect(broken?.issue).toBeTruthy();
    const got = await prefabs.get('g1', 'broken');
    expect(got.ok).toBe(false);
  });

  it('F2 an invalid prefab writes nothing and fails', async () => {
    const before = (await repo.git(['rev-parse', 'HEAD'])).trim();
    const set = await prefabs.set('g1', prefab('bad', { objects: [] }));
    expect(set.ok).toBe(false);
    const unsafe = await prefabs.set('g1', prefab('../escape'));
    expect(unsafe.ok).toBe(false);
    expect((await repo.git(['rev-parse', 'HEAD'])).trim()).toBe(before);
    expect((await prefabs.list('g1')).ok && (await prefabs.list('g1'))).toEqual({ ok: true, value: { prefabs: [] } });
  });

  it('F3 delete of a missing prefab fails without a commit; delete of a present one commits', async () => {
    const before = (await repo.git(['rev-parse', 'HEAD'])).trim();
    expect((await prefabs.delete('g1', 'nope')).ok).toBe(false);
    expect((await repo.git(['rev-parse', 'HEAD'])).trim()).toBe(before);
    await prefabs.set('g1', prefab('grove'));
    const del = await prefabs.delete('g1', 'grove');
    expect(del.ok).toBe(true);
    expect((await repo.git(['log', '-1', '--format=%s'])).trim()).toBe('Delete prefab grove');
    expect((await prefabs.list('g1'))).toEqual({ ok: true, value: { prefabs: [] } });
  });

  it('refuses to write through a levels folder that is a symlink out of the game', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'prefab-out-'));
    await symlink(outside, join(repo.path, 'levels'));
    const set = await prefabs.set('g1', prefab('grove'));
    expect(set.ok).toBe(false);
  });

  it('an unknown game fails', async () => {
    expect((await prefabs.list('nope')).ok).toBe(false);
  });
});
