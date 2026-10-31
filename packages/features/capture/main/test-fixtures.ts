import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CaptureClipboard, CaptureDesktopSource, CaptureElectron, CaptureImage } from './port';

/**
 * Fakes for Capture's main-half tests. **Nothing here touches a real screen, permission, shortcut or
 * clipboard** — the whole point of the port: a grab is a fake image of a fake display, the permission is
 * a field, the clipboard is an object, and a "registered" shortcut is a map entry.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type FakeImage = CaptureImage & {
  label: string;
  cropped?: { x: number; y: number; width: number; height: number };
};

/** An image whose "PNG" is the signature plus its label and size — distinct per image, never decoded. */
export function fakeImage(width: number, height: number, label = 'img'): FakeImage {
  const bytes = Uint8Array.from([
    ...PNG_SIGNATURE,
    ...new TextEncoder().encode(`${label}:${width}x${height}`),
  ]);
  const image: FakeImage = {
    label,
    isEmpty: () => width === 0 || height === 0,
    getSize: () => ({ width, height }),
    toPNG: () => bytes,
    toJPEG: () => Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    toDataURL: () => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
    crop: (rect) => ({ ...fakeImage(rect.width, rect.height, `${label}-crop`), cropped: rect }),
    resize: ({ width: w }) =>
      fakeImage(w ?? width, Math.round(((w ?? width) / width) * height), `${label}-small`),
  };
  return image;
}

export type FakeClipboard = CaptureClipboard & {
  formats: string[];
  markers: Set<string>;
  text: string;
  image: CaptureImage;
  reads: number;
  written: Array<{ kind: 'text'; text: string } | { kind: 'image'; image: CaptureImage }>;
  set: (next: {
    text?: string;
    image?: CaptureImage;
    formats?: string[];
    markers?: string[];
  }) => void;
};

export function fakeClipboard(): FakeClipboard {
  const clip: FakeClipboard = {
    formats: [],
    markers: new Set(),
    text: '',
    image: fakeImage(0, 0),
    reads: 0,
    written: [],
    set: ({ text = '', image, formats, markers = [] }) => {
      clip.text = text;
      clip.image = image ?? fakeImage(0, 0);
      clip.formats = formats ?? [...(text ? ['text/plain'] : []), ...(image ? ['image/png'] : [])];
      clip.markers = new Set(markers);
    },
    availableFormats: async () => {
      clip.reads += 1;
      return [...clip.formats];
    },
    has: async (format) => clip.markers.has(format),
    readText: async () => {
      clip.reads += 1;
      return clip.text;
    },
    readImage: async () => {
      clip.reads += 1;
      return clip.image;
    },
    writeText: async (text) => {
      clip.written.push({ kind: 'text', text });
    },
    writeImage: async (image) => {
      clip.written.push({ kind: 'image', image });
    },
  };
  return clip;
}

export type FakeElectron = CaptureElectron & {
  status: string;
  sourcesCalls: Array<{ types: string[]; thumbnailSize: { width: number; height: number } }>;
  shortcuts: Map<string, () => void>;
  /** Chords another app "holds": register answers false. */
  taken: Set<string>;
  hidden: number;
  restored: number;
  focused: number;
  revealed: string[];
  settingsOpened: number;
  clip: FakeClipboard;
  screens: CaptureDesktopSource[];
  windows: CaptureDesktopSource[];
};

export function fakeElectron(
  overrides: Partial<Pick<FakeElectron, 'platform' | 'status'>> = {},
): FakeElectron {
  const clip = fakeClipboard();
  const el: FakeElectron = {
    platform: overrides.platform ?? 'darwin',
    status: overrides.status ?? 'granted',
    sourcesCalls: [],
    shortcuts: new Map(),
    taken: new Set(),
    hidden: 0,
    restored: 0,
    focused: 0,
    revealed: [],
    settingsOpened: 0,
    clip,
    screens: [
      {
        id: 'screen:1:0',
        name: 'Built-in Display',
        display_id: '1',
        thumbnail: fakeImage(3024, 1964, 'screen1'),
      },
      {
        id: 'screen:2:0',
        name: 'Studio Display',
        display_id: '2',
        thumbnail: fakeImage(5120, 2880, 'screen2'),
      },
    ],
    windows: [
      {
        id: 'window:42:0',
        name: 'Terminal',
        display_id: '',
        thumbnail: fakeImage(1200, 800, 'win42'),
      },
    ],
    getSources: async (options) => {
      el.sourcesCalls.push({
        types: [...options.types],
        thumbnailSize: { ...options.thumbnailSize },
      });
      return [
        ...(options.types.includes('screen') ? el.screens : []),
        ...(options.types.includes('window') ? el.windows : []),
      ];
    },
    screenAccessStatus: () => el.status,
    openScreenRecordingSettings: async () => {
      el.settingsOpened += 1;
    },
    displays: () => [
      {
        id: 1,
        size: { width: 1512, height: 982 },
        scaleFactor: 2,
        bounds: { x: 0, y: 0, width: 1512, height: 982 },
      },
      {
        id: 2,
        size: { width: 2560, height: 1440 },
        scaleFactor: 2,
        bounds: { x: 1512, y: 0, width: 2560, height: 1440 },
      },
    ],
    displayUnderPointer: () => ({
      id: 2,
      size: { width: 2560, height: 1440 },
      scaleFactor: 2,
      bounds: { x: 1512, y: 0, width: 2560, height: 1440 },
    }),
    globalShortcut: {
      register: (accelerator, callback) => {
        if (accelerator === 'Bogus+Chord') throw new Error('conversion failure');
        if (el.taken.has(accelerator)) return false;
        el.shortcuts.set(accelerator, callback);
        return true;
      },
      unregister: (accelerator) => {
        el.shortcuts.delete(accelerator);
      },
    },
    clipboard: clip,
    imageFromPng: (bytes) => {
      const image = fakeImage(10, 10, 'from-png');
      return { ...image, toPNG: () => bytes };
    },
    showItemInFolder: (path) => {
      el.revealed.push(path);
    },
    hideOwnWindows: async () => {
      el.hidden += 1;
      return () => {
        el.restored += 1;
      };
    },
    focusApp: () => {
      el.focused += 1;
    },
  };
  return el;
}

/** A temp directory per test, removed after — never the user's own data directory. */
export async function tempDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-capture-'));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Timers the test drives by hand. */
export function manualTimers() {
  const live = new Map<number, () => void>();
  let next = 1;
  return {
    live,
    setInterval: (fn: () => void) => {
      const id = next++;
      live.set(id, fn);
      return id;
    },
    clearInterval: (handle: unknown) => {
      live.delete(handle as number);
    },
    fire: () => {
      for (const fn of live.values()) fn();
    },
  };
}

/** WebM's EBML header, then filler. */
export const webmChunk = (size = 32): Uint8Array => {
  const bytes = new Uint8Array(size);
  bytes.set([0x1a, 0x45, 0xdf, 0xa3]);
  return bytes;
};
