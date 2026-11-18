import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `@midnite/studio-git-engine/diff` is the one git-engine subpath the mobile app takes (Phase 146 Theme D6),
 * resolved from source. That only works while the parser stays pure: it may import `@midnite/studio-shared`
 * and nothing else (no node builtins, no sibling module).
 */
describe('diff-parser purity', () => {
  it('imports only @midnite/studio-shared', () => {
    const source = readFileSync(fileURLToPath(new URL('./diff-parser.ts', import.meta.url)), 'utf8');
    const specifiers = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const sideEffect = [...source.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    expect([...specifiers, ...sideEffect]).toEqual(['@midnite/studio-shared']);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it('is exported as ./diff', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
    expect(pkg.exports['./diff']).toEqual({
      types: './dist/parsers/diff-parser.d.ts',
      default: './dist/parsers/diff-parser.js',
    });
  });
});
