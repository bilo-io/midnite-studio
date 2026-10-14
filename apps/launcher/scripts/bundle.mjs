#!/usr/bin/env node
/**
 * Bundle main + preload into single CommonJS files under `dist/`.
 *
 * Everything is inlined except `electron` itself — the launcher has no native
 * modules, which is most of why it stays small next to Studio. zod and the one
 * `shared` file main takes (`studio-link.ts`) are inlined, so the packaged app
 * carries no workspace symlinks for electron-builder to trip over.
 */
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
  logLevel: 'warning',
  minify: process.env.NODE_ENV === 'production',
};

await Promise.all([
  build({ ...common, entryPoints: ['src/main/index.ts'], outfile: 'dist/main.cjs' }),
  build({ ...common, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload.cjs' }),
]);
