import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findForbiddenArtifacts, isForbiddenArtifact } from './forbidden-artifacts.mjs';

describe('forbidden artifacts', () => {
  it('flags maps, .vite dirs and stats.html', () => {
    expect(isForbiddenArtifact('assets/index-abc.js.map')).toBe(true);
    expect(isForbiddenArtifact('.vite/manifest.json')).toBe(true);
    expect(isForbiddenArtifact('stats.html')).toBe(true);
    expect(isForbiddenArtifact('assets/index-abc.js')).toBe(false);
    expect(isForbiddenArtifact('index.html')).toBe(false);
  });

  it('walks a directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'fa-'));
    mkdirSync(join(root, 'assets'));
    mkdirSync(join(root, '.vite'));
    writeFileSync(join(root, 'index.html'), '');
    writeFileSync(join(root, 'assets', 'a.js'), '');
    writeFileSync(join(root, 'assets', 'a.js.map'), '');
    writeFileSync(join(root, '.vite', 'manifest.json'), '');
    expect(findForbiddenArtifacts(root).sort()).toEqual(['.vite', 'assets/a.js.map']);
    expect(findForbiddenArtifacts(join(root, 'nope'))).toEqual([]);
  });
});
