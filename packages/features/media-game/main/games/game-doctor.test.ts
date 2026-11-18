// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  compareSemver,
  GAME_KIT_VERSION,
  GAME_MANIFEST_FILE,
  GAME_RULES,
  GameCreateRequestSchema,
  GameDiagnosisSchema,
  type GameDiagnosis,
  type GameManifest,
} from '@midnite/studio-shared';

import { composeStarter } from './compose';
import { diagnoseGame, diagnoseGameCheap } from './game-doctor';
import { listGames } from './game-list';
import { initialManifest } from './game-scaffold';
import { createGameService, type GameServiceDeps } from './game-service';

vi.setConfig({ testTimeout: 30_000 });

const FIXTURES = join(__dirname, '__fixtures__', 'doctor');
const TEMPLATE_DIR = join(__dirname, '../../../../../templates/media-game');

const rules = (d: GameDiagnosis): string[] => d.findings.map((f) => f.rule);

let tmp: string;
beforeEach(async () => {
  tmp = await realpath(await mkdtemp(join(tmpdir(), 'midnite-doctor-')));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** A valid manifest for a hand-built game, with overrides. */
function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    name: 'Doc',
    engine: 'phaser',
    dimension: '2d',
    perspective: 'top-down',
    genre: null,
    starter: 'blank',
    entry: 'index.html',
    kitVersion: GAME_KIT_VERSION,
    vendored: {},
    assets: [],
    ...overrides,
  };
}

/** A minimal game that passes manifest, entry and kit: callers add the gap they test. */
async function game(overrides: Record<string, unknown> = {}): Promise<string> {
  const root = join(tmp, 'game');
  await mkdir(join(root, 'src'), { recursive: true });
  await mkdir(join(root, 'kit', 'phaser'), { recursive: true });
  await writeFile(join(root, GAME_MANIFEST_FILE), JSON.stringify(manifest(overrides)), 'utf8');
  await writeFile(join(root, 'index.html'), '<script type="module" src="./src/main.js"></script>', 'utf8');
  await writeFile(join(root, 'src', 'main.js'), "import { boot } from 'kit/phaser/boot.js';\nboot();\n", 'utf8');
  return root;
}

describe('diagnoseGame — the fixtures', () => {
  it('legacy-3d (GTACT-shaped): an old kit and no levels', async () => {
    const d = await diagnoseGame(join(FIXTURES, 'legacy-3d'));
    expect(rules(d)).toEqual(['kit.outdated', 'levels.none']);
    expect(d.findings[0]).toMatchObject({ level: 'warn', area: 'kit', fixId: 'upgrade-kit' });
    expect(d.findings[1]).toMatchObject({ level: 'info', fixId: null });
    expect(d.findings[1]!.message).toContain('midnite-media-game-build');
    expect(d).toMatchObject({ hasManifest: true, status: 'warn', counts: { error: 0, warn: 1, info: 1 } });
    expect(GameDiagnosisSchema.safeParse(d).success).toBe(true);
  });

  it('shmup-legacy (Starbreaker-shaped): legacy vendored, no kit, no hook, no levels', async () => {
    const d = await diagnoseGame(join(FIXTURES, 'shmup-legacy'));
    expect(rules(d)).toEqual(['manifest.vendored-legacy', 'kit.missing', 'kit.hook-missing', 'levels.none']);
    expect(d.findings[0]).toMatchObject({ fixId: 'normalise-vendored', path: GAME_MANIFEST_FILE });
    expect(d.status).toBe('warn');
  });

  it('vite-no-manifest (SynthSurf-shaped): no manifest, and a bundled entry with no build', async () => {
    const d = await diagnoseGame(join(FIXTURES, 'vite-no-manifest'));
    expect(rules(d)).toEqual(['manifest.missing', 'entry.bundled-without-build', 'kit.missing', 'kit.hook-missing', 'levels.none']);
    expect(d.findings[0]).toMatchObject({ level: 'error', fixId: 'write-manifest' });
    expect(d.findings[1]).toMatchObject({ level: 'warn', fixId: 'add-build', path: 'index.html' });
    expect(d).toMatchObject({ hasManifest: false, status: 'error' });
  });

  it('the cheap variant runs manifest, entry and kit only', async () => {
    expect(rules(await diagnoseGameCheap(join(FIXTURES, 'legacy-3d')))).toEqual(['kit.outdated']);
    expect(rules(await diagnoseGameCheap(join(FIXTURES, 'shmup-legacy')))).toEqual(['manifest.vendored-legacy', 'kit.missing']);
    expect(rules(await diagnoseGameCheap(join(FIXTURES, 'vite-no-manifest')))).toEqual(['manifest.missing', 'entry.bundled-without-build', 'kit.missing']);
  });

  it('a game composed from a starter answers ok', async () => {
    const dest = join(tmp, 'starter');
    await mkdir(dest);
    const composed = await composeStarter('top-down', dest, { templateDir: TEMPLATE_DIR, name: 'Clean' });
    expect(composed.ok, JSON.stringify(composed)).toBe(true);
    const readsLevels = await stat(join(dest, 'levels', 'level.tmj')).then(() => true, () => false);
    const req = GameCreateRequestSchema.parse({ name: 'Clean', engine: 'phaser', perspective: 'top-down', starter: 'top-down' });
    const m: GameManifest = initialManifest(req, 'off', { phaser: '3.90.0' }, readsLevels);
    await writeFile(join(dest, GAME_MANIFEST_FILE), JSON.stringify(m, null, 2), 'utf8');
    const d = await diagnoseGame(dest);
    expect(d.findings.filter((f) => f.level !== 'info'), JSON.stringify(d.findings)).toEqual([]);
    expect(d.status).toBe('ok');
  });
});

describe('diagnoseGame — each check', () => {
  it('never throws on a folder that does not exist', async () => {
    const d = await diagnoseGame(join(tmp, 'nope'));
    expect(d.status).toBe('error');
    expect(rules(d)).toContain('manifest.missing');
  });

  it('reports invalid JSON once, and still checks the entry and kit', async () => {
    const root = await game();
    await writeFile(join(root, GAME_MANIFEST_FILE), '{ nope', 'utf8');
    const d = await diagnoseGame(root);
    expect(rules(d)).toEqual(['manifest.invalid-json', 'levels.none']);
    expect(d.hasManifest).toBe(true);
  });

  it('raises an unknown genre once, not again as a schema issue, and one schema finding per other issue', async () => {
    const root = await game({ genre: 'dating-sim', name: '' });
    const d = await diagnoseGame(root);
    expect(rules(d).filter((r) => r.startsWith('manifest.'))).toEqual(['manifest.genre-unknown', 'manifest.schema']);
    expect(d.findings.find((f) => f.rule === 'manifest.genre-unknown')).toMatchObject({ fixId: 'set-genre' });
    expect(d.findings.find((f) => f.rule === 'manifest.schema')!.message).toMatch(/^name: /);
  });

  it('entry.missing when there is no index.html', async () => {
    const root = await game();
    await rm(join(root, 'index.html'));
    expect(rules(await diagnoseGameCheap(root))).toEqual(['entry.missing']);
  });

  it('a plain relative module src is not a bundler entry, even beside a TypeScript devDependency', async () => {
    const root = await game();
    await writeFile(join(root, 'index.html'), '<script type="module" src="src/main.js"></script>', 'utf8');
    await writeFile(join(root, 'package.json'), JSON.stringify({ devDependencies: { typescript: '5.9.0' } }), 'utf8');
    expect(rules(await diagnoseGameCheap(root))).toEqual([]);
    await writeFile(join(root, 'index.html'), '<script type="module">import { boot } from "phaser-kit";</script>', 'utf8');
    expect(rules(await diagnoseGameCheap(root))).toEqual(['entry.bundled-without-build']);
  });

  it('a build game: build-out-missing is info, and a missing kit is info', async () => {
    const root = await game({ build: { command: 'pnpm build', out: 'dist' } });
    await rm(join(root, 'kit'), { recursive: true });
    const cheap = await diagnoseGameCheap(root);
    expect(cheap.findings.map((f) => [f.rule, f.level])).toEqual([
      ['entry.build-out-missing', 'info'],
      ['kit.missing', 'info'],
    ]);
    expect(cheap.status).toBe('ok');
    await mkdir(join(root, 'dist'));
    await writeFile(join(root, 'dist', 'index.html'), '<html></html>', 'utf8');
    expect(rules(await diagnoseGameCheap(root))).toEqual(['kit.missing']);
  });

  it('kit.hook-missing when nothing under src/ installs the hook', async () => {
    const root = await game();
    await writeFile(join(root, 'src', 'main.js'), 'export {};\n', 'utf8');
    expect(rules(await diagnoseGame(root))).toContain('kit.hook-missing');
    await writeFile(join(root, 'src', 'main.js'), "import { installHook } from '../kit/core/hook.js';\ninstallHook({});\n", 'utf8');
    expect(rules(await diagnoseGame(root))).not.toContain('kit.hook-missing');
  });

  it('levels: not declared, start missing, and an invalid level', async () => {
    const root = await game();
    await mkdir(join(root, 'levels'));
    await writeFile(join(root, 'levels', 'one.tmj'), '{ broken', 'utf8');
    let d = await diagnoseGame(root);
    expect(rules(d)).toEqual(['levels.not-declared', 'levels.invalid']);
    expect(d.findings[0]).toMatchObject({ fixId: 'declare-levels' });
    expect(d.findings[1]).toMatchObject({ path: 'levels/one.tmj' });

    await writeFile(join(root, GAME_MANIFEST_FILE), JSON.stringify(manifest({ levels: { dir: 'levels', start: 'two' } })), 'utf8');
    d = await diagnoseGame(root);
    expect(rules(d)).toEqual(['levels.start-missing', 'levels.invalid']);
  });

  it('assets: unlisted, missing file and hash mismatch', async () => {
    const sha = (text: string): string => createHash('sha256').update(text).digest('hex');
    const asset = (name: string, path: string, sha256: string) => ({
      name,
      kind: 'image',
      path,
      source: { tab: 'image', repoId: null, path: 'x' },
      sha256,
      importedAt: '2026-11-17T00:00:00.000Z',
    });
    const root = await game({
      assets: [asset('good', 'assets/image/good.png', sha('good')), asset('stale', 'assets/image/stale.png', sha('old')), asset('gone', 'assets/image/gone.png', sha('x'))],
    });
    await mkdir(join(root, 'assets', 'image'), { recursive: true });
    await writeFile(join(root, 'assets', 'image', 'good.png'), 'good');
    await writeFile(join(root, 'assets', 'image', 'stale.png'), 'new');
    await writeFile(join(root, 'assets', 'image', 'extra.png'), 'extra');
    const d = await diagnoseGame(root);
    const assets = d.findings.filter((f) => f.area === 'assets').map((f) => [f.rule, f.path]);
    expect(assets).toEqual([
      ['assets.unlisted', 'assets/image/extra.png'],
      ['assets.hash-mismatch', 'assets/image/stale.png'],
      ['assets.missing-file', 'assets/image/gone.png'],
    ]);
  });

  it('every finding carries the rule table area, and the table level unless the doctor lowers it', async () => {
    const d = await diagnoseGame(join(FIXTURES, 'vite-no-manifest'));
    for (const finding of d.findings) expect(finding.area).toBe(GAME_RULES[finding.rule].area);
  });
});

describe('compareSemver', () => {
  it('orders versions and puts a pre-release before its release', () => {
    expect(compareSemver('0.11.0', '0.12.0')).toBeLessThan(0);
    expect(compareSemver('0.12.0', '0.12.0')).toBe(0);
    expect(compareSemver('1.0.0', '0.12.0')).toBeGreaterThan(0);
    expect(compareSemver('0.12.0-rc.1', '0.12.0')).toBeLessThan(0);
    expect(compareSemver('nope', '0.12.0')).toBeNull();
  });
});

describe('listGames and the service', () => {
  it('fills status and findingCount from the cheap diagnosis', async () => {
    const root = join(tmp, 'root');
    await mkdir(root);
    const games = await listGames(root, [join(FIXTURES, 'legacy-3d'), join(FIXTURES, 'shmup-legacy')]);
    expect(games.map((g) => [g.name, g.status, g.findingCount])).toEqual([
      ['Legacy 3D', 'warn', 1],
      ['Shmup Legacy', 'warn', 2],
    ]);
    const lookup = await listGames(root, [join(FIXTURES, 'legacy-3d')], { diagnose: false });
    expect(lookup.map((g) => [g.status, g.findingCount])).toEqual([[null, 0]]);
  });

  function service(repos: string[] = []) {
    const deps = {
      settings: { load: async () => ({ version: 1, gamesRoot: join(tmp, 'root') }), save: async () => undefined },
      runner: {},
      templateDir: '',
      enginesDir: '',
      registerRepo: async () => ({ ok: true as const }),
      listRepoPaths: async () => repos,
      send: vi.fn(),
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as GameServiceDeps;
    return createGameService(deps);
  }

  it('doctor by gameId resolves a listed game; by path takes an existing absolute folder', async () => {
    await mkdir(join(tmp, 'root'));
    const legacy = join(FIXTURES, 'legacy-3d');
    const svc = service([legacy]);
    const [listed] = await svc.list();
    const byId = await svc.doctor({ gameId: listed!.gameId });
    expect(byId.ok && rules(byId.value)).toEqual(['kit.outdated', 'levels.none']);

    const byPath = await svc.doctor({ path: join(FIXTURES, 'vite-no-manifest') });
    expect(byPath.ok && byPath.value.hasManifest).toBe(false);

    expect(await svc.doctor({ gameId: 'g-nope' })).toMatchObject({ ok: false, message: 'That game was not found.' });
    expect(await svc.doctor({ path: 'relative/path' })).toMatchObject({ ok: false });
    expect(await svc.doctor({ path: join(tmp, 'missing') })).toMatchObject({ ok: false, message: 'That folder does not exist.' });
    const file = join(tmp, 'file.txt');
    await writeFile(file, 'x');
    expect(await svc.doctor({ path: file })).toMatchObject({ ok: false, message: 'That path is not a folder.' });
    // Read-only: diagnosing changed nothing.
    expect(JSON.parse(await readFile(join(legacy, GAME_MANIFEST_FILE), 'utf8')).kitVersion).toBe('0.11.0');
  });
});
