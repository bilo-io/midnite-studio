#!/usr/bin/env node
/**
 * Bundle the main process and preload into single files for packaging.
 *
 * The alternative — shipping `dist/` plus a pnpm `node_modules` — does not
 * survive electron-builder. pnpm links workspace packages as symlinks into
 * sibling directories, electron-builder follows them into the asar, and the
 * build dies on paths outside the app root. Inlining `@midnite/studio-shared` and
 * `@midnite/studio-git-engine` (both plain TypeScript) removes the problem at the
 * source and shrinks the asar to two files.
 *
 * Three things stay external:
 *   electron   provided by the runtime; bundling it is meaningless
 *   node-pty   a native module — a .node binary cannot be inlined
 *   dugite     locates its bundled git relative to its own __dirname, so it has
 *              to remain a real directory on disk (see electron-builder.yml)
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/**
 * Sourcemaps are opt-in (Phase 36 Theme C). `dist/` was 70 MB, ~54 MB of it
 * maps that nothing reads unless someone is actually debugging a packaged
 * build — which is now a deliberate rebuild with the flag rather than a cost
 * every build and every artifact pays. The renderer's `vite.config.ts` reads the
 * same variable, so one switch covers both halves of the app.
 */
const wantSourcemap = process.env['MSTUDIO_SOURCEMAP'] === '1';

const common = {
  bundle: true,
  platform: 'node',
  // Electron 33 runs Node 20.
  target: 'node20',
  format: 'cjs',
  sourcemap: wantSourcemap,
  /*
    Minified (Theme B). Main is not read by a human in a shipped build, and the
    parse it saves is on the boot path — the one place in this app where a smaller
    file is directly a faster start.

    `keepNames` because a stack trace IS read by a human: main's and the broker's
    traces go through `defaultLogger` and surface in the diagnostics view, and with
    sourcemaps now opt-in a mangled trace would be the only thing left. Preserving
    function names costs a few KB and keeps every frame in those traces nameable.
  */
  minify: true,
  keepNames: true,
  external: ['electron', 'node-pty', 'dugite'],
  logLevel: 'info',
};

/*
  The three bundles share nothing and were awaited one after another purely
  because that is how the file was written. esbuild is happy to run them
  concurrently and does its own work off-thread.
*/
const outfiles = ['main', 'preload', 'broker'].map((name) => ({
  entry: resolve(root, `src/${name === 'main' ? 'main/index.ts' : `${name}/index.ts`}`),
  out: resolve(root, `dist/bundle/${name}.js`),
}));

/*
  Stale maps, removed before the build rather than left behind.

  esbuild writes `dist/bundle/` but never prunes it, so a build with
  `MSTUDIO_SOURCEMAP=1` followed by one without leaves the previous run's
  `.map` files sitting beside a freshly minified bundle they no longer describe.
  A debugger then maps a trace through the wrong file — worse than having no map,
  because it looks like it worked.
*/
if (!wantSourcemap) {
  for (const { out } of outfiles) rmSync(`${out}.map`, { force: true });
}

await Promise.all(
  outfiles.map(({ entry, out }) => build({ ...common, entryPoints: [entry], outfile: out })),
);

