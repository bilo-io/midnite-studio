import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  GAME_SINGLE_FILE_WARN_BYTES,
  gameSingleFileWarning,
  isGameExportExcluded,
  type GameSummary,
} from '@midnite/studio-shared';

import { createGameExport, listGameFiles } from './game-export';
import { createGame } from './game-scaffold';
import { buildSingleFile, scanImportSites, type SingleFileSource } from './single-file';
import { listFilesRecursive } from './starter-files.test-helper';
import { writeZip } from './zip-writer';

/**
 * Web export (Phase 107 Theme P): the zip writer, the single-file builder and the three export
 * formats over a real composed starter. Plain Node — the real-Chromium run from `file://` is Theme Q's e2e.
 */

const TEMPLATE_DIR = join(process.cwd(), '..', '..', 'templates', 'media-game');
vi.setConfig({ testTimeout: 30_000 });

let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'midnite-export-'));
  vi.stubEnv('GIT_AUTHOR_NAME', 'Test');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'test@example.com');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Test');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'test@example.com');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(tmp, { recursive: true, force: true });
});

const has = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

describe('isGameExportExcluded', () => {
  it.each([
    '.git/config',
    '.claude/skills/x/SKILL.md',
    '.agents/a',
    '.codex/b',
    'playtests/smoke.json',
    'playtests/baselines/a@1.png',
    'node_modules/x/index.js',
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'jsconfig.json',
    'src/types.d.ts',
    '.gitignore',
    'src/.DS_Store',
  ])('leaves out %s', (path) => expect(isGameExportExcluded(path)).toBe(true));

  it.each(['index.html', 'src/main.js', 'kit/core/clock.js', 'vendor/three/three.module.js', 'assets/index.json', 'midnite-game.json', 'src/playtests.js'])(
    'keeps %s',
    (path) => expect(isGameExportExcluded(path)).toBe(false),
  );
});

describe('writeZip', () => {
  it('writes an archive the system unzip lists, tests and extracts byte for byte', async () => {
    const text = Buffer.from('hello hello hello hello hello hello'.repeat(50));
    const random = Buffer.from(Array.from({ length: 2000 }, (_, i) => (i * 7919 + 13) % 251));
    const zip = writeZip([
      { path: 'index.html', bytes: text },
      { path: 'src/données.js', bytes: Buffer.from('export const é = 1;') },
      { path: 'assets/blob.bin', bytes: random },
      { path: 'empty.txt', bytes: new Uint8Array(0) },
    ]);
    const file = join(tmp, 'out.zip');
    await writeFile(file, zip);
    const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
    for (const name of ['index.html', 'src/données.js', 'assets/blob.bin', 'empty.txt']) expect(listing).toContain(name);
    expect(execFileSync('unzip', ['-tq', file], { encoding: 'utf8' })).toContain('No errors');
    expect(execFileSync('unzip', ['-p', file, 'index.html'])).toEqual(text);
    expect(execFileSync('unzip', ['-p', file, 'assets/blob.bin'])).toEqual(random);
    expect(zip.length).toBeLessThan(text.length + random.length); // the repeating text was deflated
  });

  it('refuses names that could escape the extraction folder', () => {
    for (const path of ['../x', '/x', 'a/../b', 'a\\b', '', 'a//b']) {
      expect(() => writeZip([{ path, bytes: Buffer.from('x') }])).toThrow(/Unsafe path/);
    }
  });
});

function memory(files: Record<string, string | Buffer>): SingleFileSource {
  const map = new Map(Object.entries(files).map(([path, data]) => [path, Buffer.from(data)]));
  return {
    read: async (path) => map.get(path) ?? null,
    list: async (dir) => [...map.keys()].filter((path) => path.startsWith(`${dir}/`)),
  };
}
const decode = (url: string): string => Buffer.from(url.split(',')[1]!, 'base64').toString('utf8');
const importMapOf = (html: string): Record<string, string> =>
  (JSON.parse(/<script type="importmap">([\s\S]*?)<\/script>/.exec(html)![1]!) as { imports: Record<string, string> }).imports;

describe('scanImportSites', () => {
  it('finds static, multi-line, re-export, side-effect and dynamic specifiers, but not comments', () => {
    const js = `// import nope from 'comment'\n/**\n * import also from 'doc'\n */\nimport a from 'x';\nimport {\n  b,\n  c,\n} from "./y.js";\nexport * from './z.js';\nimport './side.js'\nconst m = await import('kit/three/nav.js');\nimport data from './d.json' with { type: 'json' };`;
    expect(scanImportSites(js).map((s) => s.specifier)).toEqual(['x', './y.js', './z.js', './side.js', 'kit/three/nav.js', './d.json']);
    for (const site of scanImportSites(js)) expect(js.slice(site.start, site.end)).toBe(site.specifier);
  });
});

describe('buildSingleFile', () => {
  const page = `<!doctype html><html><head><script type="importmap">{"imports":{"eng":"./vendor/eng.js","kit/":"./kit/"}}</script></head><body><canvas id="game"></canvas><script type="module" src="./src/main.js"></script></body></html>`;

  it('turns every reachable module into a data: URL behind one import map, cycles included', async () => {
    const result = await buildSingleFile(
      page,
      memory({
        'src/main.js': `import { a } from './a.js';\nimport e from 'eng';\nimport k from 'kit/core/k.js';\nimport cfg from './cfg.json' with { type: 'json' };\nconsole.log(a, e, k, cfg);`,
        'src/a.js': `import { b } from './b.js';\nexport const a = 1 + b;`,
        'src/b.js': `import { a } from './a.js';\nexport const b = () => a;`,
        'vendor/eng.js': 'export default 1;',
        'kit/core/k.js': 'export default 2;',
        'src/cfg.json': '{"level":3}',
        'src/unused.js': 'export default 9;',
      }),
    );
    const map = importMapOf(result.html);
    expect(Object.keys(map).sort()).toEqual(['@game/kit/core/k.js', '@game/src/a.js', '@game/src/b.js', '@game/src/cfg.json', '@game/src/main.js', '@game/vendor/eng.js']);
    expect(Object.values(map).every((url) => url.startsWith('data:'))).toBe(true);
    expect(decode(map['@game/src/main.js']!)).toContain(`from '@game/src/a.js'`);
    expect(decode(map['@game/src/main.js']!)).toContain(`from '@game/vendor/eng.js'`);
    expect(decode(map['@game/src/main.js']!)).toContain(`from '@game/kit/core/k.js'`);
    expect(decode(map['@game/src/main.js']!)).toContain(`'@game/src/cfg.json' with { type: 'json' }`);
    expect(map['@game/src/cfg.json']!.startsWith('data:application/json;base64,')).toBe(true);
    expect(result.html).toContain('<script type="module">import "@game/src/main.js";</script>');
    expect(result.html.indexOf('type="importmap"')).toBeLessThan(result.html.indexOf('type="module"'));
    expect(result.warnings).toEqual([]);
  });

  it('has no reference to anything but data: URLs', async () => {
    const { html } = await buildSingleFile(page, memory({ 'src/main.js': 'import e from "eng"; e;', 'vendor/eng.js': 'export default 1;' }));
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) expect(m[1]!.startsWith('data:')).toBe(true);
    expect(html).not.toMatch(/\bsrc=|\bhref=/);
  });

  it('inlines assets/index.json and every file it names as window.__MIDNITE_ASSETS__', async () => {
    const index = { version: 1, assets: [{ name: 'hero', kind: 'sprite', path: 'assets/sprite/hero', entry: 'atlas.json' }, { name: 'ping', kind: 'audio', path: 'assets/audio/ping.ogg' }] };
    const { html, warnings } = await buildSingleFile(
      page,
      memory({
        'src/main.js': '1;',
        'assets/index.json': JSON.stringify(index),
        'assets/sprite/hero/atlas.json': '{"frames":{}}',
        'assets/sprite/hero/hero.png': Buffer.from([137, 80, 78, 71]),
        'assets/audio/ping.ogg': Buffer.from('OggS'),
        'assets/orphan.png': Buffer.from('x'),
      }),
    );
    const inlined = /window\.__MIDNITE_ASSETS__ = (\{.*?\});<\/script>/s.exec(html)![1]!;
    const parsed = JSON.parse(inlined) as { index: typeof index; files: Record<string, string> };
    expect(parsed.index.assets.map((a) => a.name)).toEqual(['hero', 'ping']);
    expect(Object.keys(parsed.files).sort()).toEqual(['assets/audio/ping.ogg', 'assets/sprite/hero/atlas.json', 'assets/sprite/hero/hero.png']);
    expect(parsed.files['assets/sprite/hero/atlas.json']).toBe(`data:application/json;base64,${Buffer.from('{"frames":{}}').toString('base64')}`);
    expect(parsed.files['assets/audio/ping.ogg']!.startsWith('data:audio/ogg;base64,')).toBe(true);
    expect(warnings).toEqual([]);
  });

  it('warns above the size threshold, with the size in the message', async () => {
    const big = Buffer.alloc(Math.ceil((GAME_SINGLE_FILE_WARN_BYTES + 1024 * 1024) * 0.75), 7); // ~51 MB once base64'd
    const index = { version: 1, assets: [{ name: 'big', kind: 'audio', path: 'assets/audio/big.wav' }] };
    const result = await buildSingleFile(page, memory({ 'src/main.js': '1;', 'assets/index.json': JSON.stringify(index), 'assets/audio/big.wav': big }));
    expect(result.bytes).toBeGreaterThan(GAME_SINGLE_FILE_WARN_BYTES);
    expect(result.warnings[0]).toBe(gameSingleFileWarning(result.bytes));
    expect(result.warnings[0]).toMatch(/^This file is \d+ MB; browsers may be slow to open it\.$/);
    const small = await buildSingleFile(page, memory({ 'src/main.js': '1;' }));
    expect(small.warnings).toEqual([]);
  });

  it('leaves what it cannot resolve alone and says so', async () => {
    const { warnings } = await buildSingleFile(page, memory({ 'src/main.js': `import x from 'nowhere';\nimport y from './gone.js';\nimport z from 'https://cdn.example/z.js';` }));
    expect(warnings).toEqual(expect.arrayContaining(['Unresolved import left as is: nowhere', 'Imported file not found: src/gone.js', 'External import left as is: https://cdn.example/z.js']));
  });
});

describe('createGameExport on a composed platformer', () => {
  async function makeGame() {
    const created = await createGame(
      { name: 'Moon Rover', engine: 'phaser', perspective: 'platformer', starter: 'platformer' },
      { templateDir: TEMPLATE_DIR, gamesRoot: join(tmp, 'games'), registerRepo: async () => ({ ok: true as const }), defaultNetwork: 'off' },
    );
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const path = join(tmp, 'games', 'moon-rover');
    // Things that must never ship: an agent skill, a play-test, a dotfile, a type file, and a symlink out of the repo.
    await mkdir(join(path, 'playtests'), { recursive: true });
    await writeFile(join(path, 'playtests', 'extra.json'), '{}');
    await writeFile(join(path, 'src', 'types.d.ts'), 'export {};');
    await writeFile(join(path, '.env'), 'SECRET=1');
    await writeFile(join(tmp, 'outside.txt'), 'outside');
    await symlink(join(tmp, 'outside.txt'), join(path, 'src', 'link.txt'));
    const game: GameSummary = { gameId: 'g1', name: 'Moon Rover', path, engine: 'phaser', dimension: '2d', starter: 'platformer', dirty: false, valid: true, issue: null };
    return { path, exporter: createGameExport({ resolve: async (id) => (id === 'g1' ? game : null) }) };
  }

  const excludedSomewhere = (paths: string[]): string[] => paths.filter((p) => isGameExportExcluded(p) || p.includes('link.txt'));

  it('exports a folder without .git, play-tests, agent files or the symlink, and refuses an existing one', async () => {
    const { path, exporter } = await makeGame();
    const out = join(tmp, 'out');
    await mkdir(out);
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-folder', dest: out });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe(join(out, 'moon-rover-web'));
    const files = await listFilesRecursive(result.value.path);
    expect(files).toContain('index.html');
    expect(files).toContain('src/main.js');
    expect(files.some((f) => f.startsWith('vendor/phaser/'))).toBe(true);
    expect(excludedSomewhere(files)).toEqual([]);
    expect(files).toEqual((await listGameFiles(path)).filter((f) => !f.includes('link.txt')).sort());
    expect(await has(join(out, '.moon-rover-web.tmp'))).toBe(false);

    const again = await exporter.exportGame({ gameId: 'g1', format: 'game-folder', dest: out });
    expect(again).toMatchObject({ ok: false, message: 'moon-rover-web already exists in that folder.' });
    expect((await listFilesRecursive(out)).length).toBe(files.length);
  });

  it('exports a zip that lists exactly the folder export, and refuses to replace a file unless told', async () => {
    const { exporter } = await makeGame();
    const dest = join(tmp, 'moon.zip');
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const listed = execFileSync('unzip', ['-Z1', dest], { encoding: 'utf8' }).split('\n').filter(Boolean).sort();
    expect(listed).toContain('index.html');
    expect(excludedSomewhere(listed)).toEqual([]);
    expect(execFileSync('unzip', ['-tq', dest], { encoding: 'utf8' })).toContain('No errors');

    const again = await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest });
    expect(again).toMatchObject({ ok: false, message: 'moon.zip already exists in that folder.' });
    const replaced = await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest, overwrite: true });
    expect(replaced.ok).toBe(true);
  });

  it('exports one HTML file with no external reference that embeds the engine, the kit and the game', async () => {
    const { exporter } = await makeGame();
    const dest = join(tmp, 'moon.html');
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-html', dest });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    const html = await readFile(dest, 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']*)["']/gi)) expect(m[1]!.startsWith('data:')).toBe(true);
    const map = importMapOf(html);
    expect(Object.keys(map)).toEqual(expect.arrayContaining(['@game/src/main.js', '@game/vendor/phaser/phaser.esm.js', '@game/kit/core/determinism.js']));
    expect(Object.values(map).every((u) => u.startsWith('data:'))).toBe(true);
    expect(Object.keys(map).some((k) => k.includes('playtests') || k.includes('.git'))).toBe(false);
    expect(result.value.warnings).toEqual([]);
    expect(result.value.bytes).toBe(Buffer.byteLength(html));
  });

  it('refuses a destination inside the game, a relative path, a missing parent and an unknown game; writes nothing', async () => {
    const { path, exporter } = await makeGame();
    expect(await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest: join(path, 'out.zip') })).toMatchObject({ ok: false });
    expect(await has(join(path, 'out.zip'))).toBe(false);
    expect(await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest: 'out.zip' })).toMatchObject({ ok: false });
    expect(await exporter.exportGame({ gameId: 'g1', format: 'game-html', dest: join(tmp, 'nope', 'a.html') })).toMatchObject({ ok: false });
    expect(await exporter.exportGame({ gameId: 'g1', format: 'game-folder', dest: join(tmp, 'nope') })).toMatchObject({ ok: false });
    expect(await exporter.exportGame({ gameId: 'nope', format: 'game-zip', dest: join(tmp, 'a.zip') })).toMatchObject({ ok: false });
    expect(await exporter.exportGame({ gameId: 'g1', format: 'game-zip' })).toMatchObject({ ok: false });
    expect(await has(join(tmp, 'a.zip'))).toBe(false);
  });

  it('does not touch the game repo', async () => {
    const { path, exporter } = await makeGame();
    const before = (await listFilesRecursive(path)).filter((f) => !f.startsWith('.git/'));
    await exporter.exportGame({ gameId: 'g1', format: 'game-html', dest: join(tmp, 'a.html') });
    await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest: join(tmp, 'a.zip') });
    expect((await listFilesRecursive(path)).filter((f) => !f.startsWith('.git/'))).toEqual(before);
  });
});
