// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseableProcessEnv, type GameSummary } from '@midnite/studio-shared';

import { createGameExport } from './game-export';
import { buildRunPackage, buildServeScript } from './run-scaffold';

/** Run scaffold for zip/folder exports: plain Node, a real temp repo, the generated server's handler on an ephemeral port. */
let tmp: string;
beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'midnite-run-scaffold-'));
});
afterEach(() => rm(tmp, { recursive: true, force: true }));

async function makeRepo(files: Record<string, string>) {
  const path = join(tmp, 'repo');
  await mkdir(path, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(join(path, rel, '..'), { recursive: true });
    await writeFile(join(path, rel), text);
  }
  const game: GameSummary = { gameId: 'g1', name: 'Tact Game', path, engine: 'phaser', dimension: '2d', starter: 'platformer', dirty: false, valid: true, issue: null };
  return createGameExport({ resolve: async (id) => (id === 'g1' ? game : null) });
}

const unzipList = (zip: string): string[] => execFileSync('unzip', ['-Z1', zip], { env: parseableProcessEnv(), encoding: 'utf8' }).split('\n').filter(Boolean).sort();
const unzipRead = (zip: string, name: string): string => execFileSync('unzip', ['-p', zip, name], { env: parseableProcessEnv(), encoding: 'utf8' });

describe('buildRunPackage', () => {
  it('is valid JSON carrying the slug and an npm start script', () => {
    expect(JSON.parse(buildRunPackage('tact-game'))).toEqual({ name: 'tact-game', private: true, type: 'module', scripts: { start: 'node serve.mjs' } });
  });
});

describe('run scaffold in exports', () => {
  it('adds the three files to a folder export', async () => {
    const exporter = await makeRepo({ 'index.html': '<h1>hi</h1>' });
    const out = join(tmp, 'out');
    await mkdir(out);
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-folder', dest: out });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings).toEqual([]);
    for (const f of ['serve.mjs', 'package.json', 'README-run.txt']) expect((await readFile(join(result.value.path, f), 'utf8')).length).toBeGreaterThan(0);
    expect(JSON.parse(await readFile(join(result.value.path, 'package.json'), 'utf8')).name).toBe('tact-game');
  });

  it('adds the three files to a zip export', async () => {
    const exporter = await makeRepo({ 'index.html': '<h1>hi</h1>' });
    const dest = join(tmp, 'g.zip');
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(unzipList(dest)).toEqual(['README-run.txt', 'index.html', 'package.json', 'serve.mjs']);
    expect(result.value.files).toBe(4);
  });

  it('keeps a game-owned package.json and warns, in both formats', async () => {
    const exporter = await makeRepo({ 'index.html': 'x', 'package.json': '{"name":"mine"}' });
    const dest = join(tmp, 'g.zip');
    const zip = await exporter.exportGame({ gameId: 'g1', format: 'game-zip', dest });
    expect(zip.ok && zip.value.warnings).toEqual([expect.stringContaining('package.json')]);
    expect(unzipRead(dest, 'package.json')).toBe('{"name":"mine"}');
    expect(unzipList(dest)).toContain('serve.mjs');

    const out = join(tmp, 'out');
    await mkdir(out);
    const folder = await exporter.exportGame({ gameId: 'g1', format: 'game-folder', dest: out });
    expect(folder.ok && folder.value.warnings).toEqual([expect.stringContaining('package.json')]);
    if (folder.ok) expect(await readFile(join(folder.value.path, 'package.json'), 'utf8')).toBe('{"name":"mine"}');
  });

  it('leaves the single-HTML export alone', async () => {
    const exporter = await makeRepo({ 'index.html': '<html><body>x</body></html>' });
    const dest = join(tmp, 'g.html');
    const result = await exporter.exportGame({ gameId: 'g1', format: 'game-html', dest });
    expect(result.ok && result.value.files).toBe(1);
  });
});

describe('generated serve.mjs', () => {
  it('serves the entry page and refuses traversal', async () => {
    const root = join(tmp, 'site');
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'game.html'), '<h1>entry</h1>');
    await writeFile(join(root, 'src', 'a.js'), 'export {}');
    await writeFile(join(tmp, 'secret.txt'), 'secret');
    await writeFile(join(root, 'serve.mjs'), buildServeScript('game.html'));
    const mod = (await import(/* @vite-ignore */ pathToFileURL(join(root, 'serve.mjs')).href)) as { createHandler: (root: string, entry: string) => (req: unknown, res: unknown) => Promise<void> };
    const { createServer } = await import('node:http');
    const server = createServer(mod.createHandler(root, 'game.html') as never);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as { port: number };
      const get = (path: string) =>
        new Promise<{ status: number; type: string; body: string }>((resolveGet, reject) => {
          import('node:http').then(({ request }) =>
            request({ host: '127.0.0.1', port, path }, (res) => {
              let body = '';
              res.on('data', (c) => (body += c));
              res.on('end', () => resolveGet({ status: res.statusCode ?? 0, type: String(res.headers['content-type']), body }));
            })
              .on('error', reject)
              .end(),
          );
        });
      expect(await get('/')).toMatchObject({ status: 200, body: '<h1>entry</h1>' });
      expect(await get('/src/a.js')).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8' });
      expect((await get('/missing.png')).status).toBe(404);
      expect((await get('/..%2fsecret.txt')).status).toBe(403);
      expect((await get('/%2e%2e/secret.txt')).body).not.toBe('secret');
    } finally {
      server.close();
    }
  });
});
