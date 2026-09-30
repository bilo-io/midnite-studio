import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { exportDoc } from './doc-export';

describe('exportDoc', () => {
  it('writes md and html content as-is, proposing the stem plus the format extension', async () => {
    const write = vi.fn(async () => {});
    const pickDest = vi.fn(async (p: string) => `/out/${p.split('/').pop()}`);
    const printToPdf = vi.fn();
    expect(await exportDoc({ format: 'md', name: 'intro.md', content: '# Hi', defaultDir: '/exports' }, { pickDest, printToPdf, write })).toEqual({
      ok: true,
      value: { dest: '/out/intro.md' },
    });
    expect(pickDest).toHaveBeenCalledWith('/exports/intro.md', 'md');
    await exportDoc({ format: 'html', name: 'intro', content: '<html></html>' }, { pickDest, printToPdf, write });
    expect(write).toHaveBeenLastCalledWith('/out/intro.html', '<html></html>');
    expect(printToPdf).not.toHaveBeenCalled();
  });

  it('prints pdf from a temp copy of the html', async () => {
    const write = vi.fn(async () => {});
    let seen = '';
    const printToPdf = vi.fn(async (file: string) => {
      seen = await readFile(file, 'utf8');
      return Buffer.from('%PDF');
    });
    const result = await exportDoc(
      { format: 'pdf', name: 'intro.md', content: '<p>doc</p>' },
      { pickDest: async () => '/out/intro.pdf', printToPdf, write },
    );
    expect(result.ok).toBe(true);
    expect(seen).toBe('<p>doc</p>');
    expect(write).toHaveBeenCalledWith('/out/intro.pdf', Buffer.from('%PDF'));
  });

  it('answers cancelled when the dialog is dismissed', async () => {
    const write = vi.fn();
    expect(await exportDoc({ format: 'md', name: 'a', content: '' }, { pickDest: async () => null, printToPdf: vi.fn(), write })).toEqual({
      ok: false,
      kind: 'error',
      message: 'cancelled',
    });
    expect(write).not.toHaveBeenCalled();
  });
});
