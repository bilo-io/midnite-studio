#!/usr/bin/env node
/**
 * Bundle the main process and preload into single files for packaging.
 *
 * The alternative — shipping `dist/` plus a pnpm `node_modules` — does not
 * survive electron-builder. pnpm links workspace packages as symlinks into
 * sibling directories, electron-builder follows them into the asar, and the
 * build dies on paths outside the app root. Inlining `@midnite/git-shared` and
 * `@midnite/git-engine` (both plain TypeScript) removes the problem at the
 * source and shrinks the asar to two files.
 *
 * Three things stay external:
 *   electron   provided by the runtime; bundling it is meaningless
 *   node-pty   a native module — a .node binary cannot be inlined
 *   dugite     locates its bundled git relative to its own __dirname, so it has
 *              to remain a real directory on disk (see electron-builder.yml)
 */
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const common = {
  bundle: true,
  platform: 'node',
  // Electron 33 runs Node 20.
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'node-pty', 'dugite'],
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [resolve(root, 'src/main/index.ts')],
  outfile: resolve(root, 'dist/bundle/main.js'),
});

await build({
  ...common,
  entryPoints: [resolve(root, 'src/preload/index.ts')],
  outfile: resolve(root, 'dist/bundle/preload.js'),
});

await build({
  ...common,
  entryPoints: [resolve(root, 'src/broker/index.ts')],
  outfile: resolve(root, 'dist/bundle/broker.js'),
});

