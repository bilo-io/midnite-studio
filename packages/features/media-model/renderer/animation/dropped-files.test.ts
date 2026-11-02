import { describe, expect, it } from 'vitest';

import { collectDropped, fileToBase64, MAX_DROP_DEPTH, type DropEntry } from './dropped-files';

const file = (name: string) => new File(['x'], name);
const fileEntry = (name: string): DropEntry => ({ isFile: true, isDirectory: false, name, file: (resolve) => resolve(file(name)) });
/** A directory whose reader hands its children out in batches of `batch`, then an empty list. */
const dirEntry = (name: string, children: DropEntry[], batch = 100): DropEntry => ({
  isFile: false,
  isDirectory: true,
  name,
  createReader: () => {
    let at = 0;
    return {
      readEntries: (resolve) => {
        const next = children.slice(at, at + batch);
        at += batch;
        resolve(next);
      },
    };
  },
});
const item = (entry: DropEntry | null) => ({ webkitGetAsEntry: () => entry }) as unknown as DataTransferItem;
const transfer = (entries: (DropEntry | null)[], files: File[] = []) =>
  ({ items: entries.map(item), files }) as unknown as Pick<DataTransfer, 'items' | 'files'>;

describe('collectDropped', () => {
  it('walks folders and keeps only clip files, tagged with their folder', async () => {
    const dropped = await collectDropped(
      transfer([dirEntry('Combat', [fileEntry('Slash.fbx'), fileEntry('notes.txt'), fileEntry('Block.GLB')]), fileEntry('loose.bvh')]),
    );
    expect(dropped.map((d) => [d.file.name, d.folder])).toEqual([
      ['Block.GLB', 'Combat'],
      ['Slash.fbx', 'Combat'],
      ['loose.bvh', ''],
    ]);
  });

  it('reads folders larger than one reader batch', async () => {
    const many = Array.from({ length: 5 }, (_, i) => fileEntry(`c${i}.fbx`));
    const dropped = await collectDropped(transfer([dirEntry('Big', many, 2)]));
    expect(dropped).toHaveLength(5);
  });

  it('skips hidden folders and folders nested too deep', async () => {
    let deep: DropEntry = dirEntry('leaf', [fileEntry('deep.fbx')]);
    for (let i = 0; i < MAX_DROP_DEPTH + 1; i++) deep = dirEntry(`d${i}`, [deep]);
    const dropped = await collectDropped(transfer([dirEntry('.git', [fileEntry('a.fbx')]), deep]));
    expect(dropped).toEqual([]);
  });

  it('falls back to the plain file list when the browser gives no entries', async () => {
    const dropped = await collectDropped(transfer([null], [file('a.glb'), file('readme.md')]));
    expect(dropped.map((d) => d.file.name)).toEqual(['a.glb']);
  });
});

describe('fileToBase64', () => {
  it('encodes bytes, including a buffer larger than one chunk', async () => {
    expect(await fileToBase64({ arrayBuffer: async () => new TextEncoder().encode('hello').buffer })).toBe('aGVsbG8=');
    const big = new Uint8Array(0x8000 * 2 + 5).fill(65);
    expect(atob(await fileToBase64({ arrayBuffer: async () => big.buffer }))).toBe('A'.repeat(big.length));
  });
});
