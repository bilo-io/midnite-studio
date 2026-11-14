import { describe, expect, it } from 'vitest';

import { PROTECTED_HOME_FOLDERS } from '../packages/shared/src/macos-protected-paths';
import { FOLDER_NAMES, scanSource } from './tcc-guard.mjs';

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

  it('catches the shapes the first version missed', () => {
    expect(scanSource("join(\n  homedir(),\n  'Documents',\n)")).toEqual([{ line: 2, text: 'homedir(),' }]);
    expect(scanSource("const h = os.homedir();\nconst p = join(h, 'Documents');")).toHaveLength(1);
    expect(scanSource("join(userHome, 'Desktop')")).toHaveLength(1);
    expect(scanSource('`${process.env.HOME}/Documents`')).toHaveLength(1);
    expect(scanSource("path.join(process.env.HOME ?? '', 'Downloads')")).toHaveLength(1);
    expect(scanSource("const p = '~/Documents/x';")).toHaveLength(1);
    expect(scanSource("const p = `${h}/Music`; const h = homedir();")).toHaveLength(1);
  });

  it('does not flag a bare home word that is not a path, or a home join that ends before the folder', () => {
    expect(scanSource('<input placeholder="~/Downloads/x" />')).toEqual([]);
    expect(scanSource("const x = home ? 'Music' : 'x';")).toEqual([]);
    expect(scanSource("route === 'home' && show('Downloads')")).toEqual([]);
    expect(scanSource("join(homedir(), '.cache');\nshow('Music');")).toEqual([]);
    expect(scanSource("const h = os.homedir();\nshow(other, 'Documents');")).toEqual([]);
  });

  it('a mark covers its own statement, and the line above only when that line is a comment', () => {
    expect(scanSource("join(\n  homedir(), // tcc-ok: user opened it\n  'Documents',\n)")).toEqual([]);
    expect(scanSource("const a = 1; // tcc-ok: x\njoin(homedir(), 'Documents');")).toHaveLength(1);
  });

  it('keeps its folder list in step with the shared constant', () => {
    expect(FOLDER_NAMES).toEqual([...PROTECTED_HOME_FOLDERS]);
  });
});
