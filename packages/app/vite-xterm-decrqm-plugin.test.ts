// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { build, type Plugin } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { undeclaredWriteGuardPlugin, xtermDecrqmFixPlugin } from './vite-xterm-decrqm-plugin';

/**
 * The one test in this package that runs a real production build.
 *
 * It has to. The bug it guards — see `vite-xterm-decrqm-plugin.ts` — exists
 * only in minified output: the source xterm ships is valid, the dev server
 * serves it unchanged, and every other test in this suite and every e2e spec
 * runs against unminified code where the offending line is inert. A freeze
 * that reaches users through the packaged app and nothing else needs a test
 * that looks at what the packaged app actually contains.
 *
 * Deliberately not the whole renderer: a single module importing `@xterm/xterm`
 * reproduces it in a couple of seconds, and a whole-app build in the unit gate
 * would be neither.
 */
const ENTRY = "import { Terminal } from '@xterm/xterm';\nglobalThis.__T = Terminal;\n";

/** The fingerprint of the corruption: a write to an identifier declared nowhere. */
const UNDECLARED_WRITE = /void 0\s*\|\|\s*\([A-Za-z_$][\w$]*\s*=\s*\{\}\)/;

/** The real installed build, resolved from this package rather than the temp root. */
const XTERM_ESM = createRequire(import.meta.url).resolve('@xterm/xterm/lib/xterm.mjs');

let dir: string;
let run = 0;

async function bundle(plugins: Plugin[]): Promise<string> {
  const out = join(dir, `out-${++run}`);
  await build({
    root: dir,
    configFile: false,
    logLevel: 'error',
    plugins,
    resolve: { alias: { '@xterm/xterm': XTERM_ESM } },
    build: {
      outDir: out,
      minify: 'esbuild',
      lib: { entry: join(dir, 'entry.js'), formats: ['es'], fileName: 'out' },
    },
  });
  const files = await readdir(out);
  const js = files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
  return (await Promise.all(js.map((f) => readFile(join(out, f), 'utf8')))).join('\n');
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'midnite-xterm-decrqm-'));
  await writeFile(join(dir, 'entry.js'), ENTRY);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('xtermDecrqmFixPlugin', () => {
  it('xterm still ships the dead enum initialiser this plugin deletes', async () => {
    // Fails loudly on an xterm bump: either the initialiser moved, or upstream
    // dropped it and the plugin can go. Reading the package's own ESM build
    // rather than a fixture keeps the two from drifting apart silently.
    const esm = await readFile(XTERM_ESM, 'utf8');
    expect(esm).toMatch(/requestMode\(\w+,\w+\)\{let \w+;/);
  });

  it('without the plugin, minification corrupts requestMode into a runtime throw', async () => {
    // The regression itself, pinned. If this ever stops matching, the toolchain
    // fixed the bug and both plugins can be deleted — but that is a decision,
    // not something to discover by the workaround quietly doing nothing.
    expect(await bundle([])).toMatch(UNDECLARED_WRITE);
  });

  it('with the plugin, the built bundle has no write to an undeclared identifier', async () => {
    expect(await bundle([xtermDecrqmFixPlugin()])).not.toMatch(UNDECLARED_WRITE);
  });

  it('throws rather than silently skipping when xterm no longer matches', async () => {
    const { transform } = xtermDecrqmFixPlugin();
    const hook = typeof transform === 'function' ? transform : transform?.handler;
    expect(() =>
      hook?.call(
        {} as never,
        'export class X { requestMode(e, i) { return e; } }',
        '/x/@xterm/xterm/lib/xterm.mjs',
      ),
    ).toThrow(/was not found/);
  });
});

describe('undeclaredWriteGuardPlugin', () => {
  it('fails the build on a corrupted chunk, whatever produced it', async () => {
    await expect(bundle([undeclaredWriteGuardPlugin()])).rejects.toThrow(
      /undeclared identifier/,
    );
  });

  it('passes once the corruption is gone', async () => {
    await expect(
      bundle([xtermDecrqmFixPlugin(), undeclaredWriteGuardPlugin()]),
    ).resolves.toBeTypeOf('string');
  });
});
