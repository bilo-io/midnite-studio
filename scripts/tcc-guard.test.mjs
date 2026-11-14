import { describe, expect, it } from 'vitest';

import { scanSource } from './tcc-guard.mjs';

describe('tcc-guard scanSource', () => {
  it('fails an unmarked home join with a protected folder', () => {
    expect(scanSource("const p = join(homedir(), 'Pictures');")).toHaveLength(1);
    expect(scanSource("join(app.getPath('home'), 'Documents', 'x')")).toHaveLength(1);
    expect(scanSource('paths: [`${home}/Downloads`]')).toHaveLength(1);
  });

  it('passes the same line with a tcc-ok mark, on the line or above it', () => {
    expect(scanSource("const p = join(homedir(), 'Pictures'); // tcc-ok: user opened the picker")).toEqual([]);
    expect(scanSource("// tcc-ok: user pressed Scan\nconst p = join(homedir(), 'Pictures');")).toEqual([]);
  });

  it('fails Electron getPath for a protected folder unless marked', () => {
    expect(scanSource("app.getPath('downloads')")).toHaveLength(1);
    expect(scanSource("app.getPath('music') // tcc-ok: user chose Export")).toEqual([]);
  });

  it('ignores dotfile paths, unprotected folders, comments and a mark with no reason', () => {
    expect(scanSource("join(homedir(), '.claude', 'projects')")).toEqual([]);
    expect(scanSource("join(homedir(), 'Dev')")).toEqual([]);
    expect(scanSource("// join(homedir(), 'Pictures')")).toEqual([]);
    expect(scanSource("join(homedir(), 'Pictures') // tcc-ok:")).toHaveLength(1);
  });
});
