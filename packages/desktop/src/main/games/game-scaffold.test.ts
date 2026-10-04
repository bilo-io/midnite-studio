import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { execGit } from '@midnite/studio-git-engine';
import { GAME_MANIFEST_FILE, parseGameManifest } from '@midnite/studio-shared';

import { createGame, gameIdForPath } from './game-scaffold';
import { listGames } from './game-list';

// The real template, straight from the repo (vitest runs with cwd packages/desktop) — what a dev build would copy.
const TEMPLATE_DIR = join(process.cwd(), '..', '..', 'templates', 'media-game');

let parent: string;
const registerRepo = vi.fn(async () => ({ ok: true as const }));

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), 'midnite-games-'));
  registerRepo.mockClear();
  // `git commit` needs an identity; the CI runner has none.
  vi.stubEnv('GIT_AUTHOR_NAME', 'Test');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Test');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(parent, { recursive: true, force: true });
});

const deps = () => ({ templateDir: TEMPLATE_DIR, gamesRoot: parent, registerRepo, defaultNetwork: 'off' as const });
const request = { name: 'Moon Rover', engine: 'phaser' as const, perspective: 'platformer' as const };

describe('createGame', () => {
  it('scaffolds a runnable repo with a valid manifest and one commit, then registers it', async () => {
    const result = await createGame(request, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const path = join(parent, 'moon-rover');
    expect(result.value.path).toBe(path);
    expect(result.value.gameId).toBe(await gameIdForPath(path));
    expect(result.value.gameId).toMatch(/^g[0-9a-f]{12}$/);

    const manifest = parseGameManifest(JSON.parse(await readFile(join(path, GAME_MANIFEST_FILE), 'utf8')));
    expect(manifest.ok).toBe(true);
    if (manifest.ok) {
      expect(manifest.manifest).toMatchObject({ name: 'Moon Rover', engine: 'phaser', dimension: '2d', network: 'off', starter: 'blank' });
    }
    expect(await readFile(join(path, 'index.html'), 'utf8')).toContain('<title>Moon Rover</title>');
    expect(await readFile(join(path, 'AGENTS.md'), 'utf8')).toContain('# Moon Rover');

    const count = await execGit(path, ['rev-list', '--count', 'HEAD']);
    expect(count.stdout.trim()).toBe('1');
    const subject = await execGit(path, ['log', '-1', '--format=%s']);
    expect(subject.stdout.trim()).toBe('Create Moon Rover from blank');
    expect(registerRepo).toHaveBeenCalledWith(path);
  });

  it('refuses an existing non-empty folder with the folder in the message', async () => {
    const target = join(parent, 'moon-rover');
    await mkdir(target);
    await writeFile(join(target, 'keep.txt'), 'mine');

    const result = await createGame(request, deps());
    expect(result).toEqual({ ok: false, kind: 'error', message: `${target} already exists — choose another name.` });
    expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('mine');
    expect(registerRepo).not.toHaveBeenCalled();
  });

  it('removes its temp dir and leaves no folder when the template is missing', async () => {
    const result = await createGame(request, { ...deps(), templateDir: join(parent, 'no-template') });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'error') expect(result.message).toContain('missing from this build');
    expect(await readdir(parent)).toEqual([]);
  });

  it('refuses a starter that has not landed yet', async () => {
    const result = await createGame({ ...request, starter: 'platformer-base' }, deps());
    expect(result.ok).toBe(false);
    expect(await readdir(parent)).toEqual([]);
  });

  it('leaves the folder in place and says so when registering fails', async () => {
    registerRepo.mockResolvedValueOnce({ ok: false as never } as never);
    const result = await createGame(request, deps());
    expect(result.ok).toBe(false);
    expect(await readdir(parent)).toContain('moon-rover');
  });
});

describe('listGames', () => {
  it('lists game repos under the root, plus registered repos carrying a manifest, deduped', async () => {
    await createGame(request, deps());
    await createGame({ ...request, name: 'Sky Fort', engine: 'three', perspective: 'third-person' }, deps());
    const broken = join(parent, 'broken');
    await mkdir(broken);
    await writeFile(join(broken, GAME_MANIFEST_FILE), '{ nope');
    await mkdir(join(parent, 'not-a-game'));

    const games = await listGames(parent, [join(parent, 'moon-rover')]);
    expect(games.map((game) => game.name)).toEqual(['broken', 'Moon Rover', 'Sky Fort']);
    const [bad, moon, sky] = games;
    expect(bad).toMatchObject({ valid: false, engine: null });
    expect(bad?.issue).toContain('not valid JSON');
    expect(moon).toMatchObject({ valid: true, engine: 'phaser', dimension: '2d', dirty: false });
    expect(sky).toMatchObject({ valid: true, engine: 'three', dimension: '3d' });
  });

  it('marks a game with uncommitted work dirty', async () => {
    await createGame(request, deps());
    await writeFile(join(parent, 'moon-rover', 'src', 'main.js'), '// changed');
    const [game] = await listGames(parent, []);
    expect(game?.dirty).toBe(true);
  });
});
