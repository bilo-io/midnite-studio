import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guard that the shipped preload stays sandbox-safe.
 *
 * A sandboxed preload cannot `require('node:…')` — the window goes blank with
 * no compile-time error. This reads the esbuild output (not the TypeScript
 * source) because bundling can inline or rewrite imports.
 */
describe('preload bundle', () => {
  const bundlePath = join(__dirname, '../../dist/bundle/preload.js');

  it('contains no node: builtin requires', () => {
    const source = readFileSync(bundlePath, 'utf8');
    expect(source).not.toMatch(/require\s*\(\s*['"]node:/);
  });
});
