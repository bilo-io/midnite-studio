// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CLIPBOARD_SKIP_MARKERS } from '@midnite/studio-shared';

import { isMarked } from './clipboard-history';
import { electronCaptureClipboard, type ElectronClipboard } from './electron-port';
import { fakeImage } from './test-fixtures';

/**
 * The Electron 44+ clipboard adapter. The fake mirrors what Electron 45 was observed to report on
 * macOS: raw pasteboard types wrapped as `electron application/osclipboard;format="…"`, `has()` true
 * only for that wrapped form, and `electron application/findtext` listed even on an empty clipboard.
 */
const raw = (type: string) => `electron application/osclipboard;format="${type}"`;

function fakeElectronClipboard(types: string[], blobs: Record<string, Blob> = {}) {
  const written: unknown[][] = [];
  const clipboard: ElectronClipboard = {
    read: async () => [{ types, getType: async (type: string) => blobs[type] }],
    has: async (type) => types.includes(type),
    readText: async () => 'text',
    writeText: vi.fn(async () => undefined),
    write: async (items) => void written.push(items),
  };
  class ClipboardItem {
    constructor(readonly items: Record<string, Blob>) {}
  }
  const nativeImage = { createFromBuffer: (bytes: Uint8Array) => fakeImage(bytes.byteLength, 1) };
  return { clipboard, ClipboardItem, nativeImage, written };
}

describe('electronCaptureClipboard (Electron 44+)', () => {
  it('lists raw pasteboard types by their bare name and drops findtext', async () => {
    const { clipboard, ClipboardItem, nativeImage } = fakeElectronClipboard([
      'text/plain',
      'electron application/findtext',
      raw('org.nspasteboard.ConcealedType'),
    ]);
    const port = electronCaptureClipboard(clipboard, ClipboardItem, nativeImage);
    expect(await port.availableFormats()).toEqual(['text/plain', 'org.nspasteboard.ConcealedType']);
  });

  it('still skips a password manager copy: the marker matches from formats and from has()', async () => {
    const { clipboard, ClipboardItem, nativeImage } = fakeElectronClipboard(['text/plain', raw(CLIPBOARD_SKIP_MARKERS[0])]);
    const port = electronCaptureClipboard(clipboard, ClipboardItem, nativeImage);
    expect(await isMarked(port, await port.availableFormats())).toBe(true);
    expect(await port.has(CLIPBOARD_SKIP_MARKERS[0])).toBe(true);
    expect(await isMarked(port, ['text/plain'])).toBe(true);
  });

  it('reports an empty clipboard as no formats', async () => {
    const { clipboard, ClipboardItem, nativeImage } = fakeElectronClipboard(['electron application/findtext']);
    expect(await electronCaptureClipboard(clipboard, ClipboardItem, nativeImage).availableFormats()).toEqual([]);
  });

  it('reads an image from its PNG blob, and an empty image when there is none', async () => {
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    const withImage = fakeElectronClipboard(['image/png'], { 'image/png': new Blob([png]) });
    const image = await electronCaptureClipboard(withImage.clipboard, withImage.ClipboardItem, withImage.nativeImage).readImage();
    expect(image.getSize().width).toBe(png.byteLength);
    const textOnly = fakeElectronClipboard(['text/plain']);
    expect((await electronCaptureClipboard(textOnly.clipboard, textOnly.ClipboardItem, textOnly.nativeImage).readImage()).isEmpty()).toBe(true);
  });

  it('writes an image as one image/png ClipboardItem', async () => {
    const { clipboard, ClipboardItem, nativeImage, written } = fakeElectronClipboard([]);
    await electronCaptureClipboard(clipboard, ClipboardItem, nativeImage).writeImage(fakeImage(2, 2));
    expect(written).toHaveLength(1);
    const [item] = written[0] as [{ items: Record<string, Blob> }];
    expect(Object.keys(item.items)).toEqual(['image/png']);
    expect(item.items['image/png']!.type).toBe('image/png');
  });
});
