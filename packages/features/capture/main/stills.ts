import { randomBytes } from 'node:crypto';

import type {
  CaptureRegionFrame,
  CaptureRegionRect,
  CaptureSource,
  CaptureSourceKind,
} from '@midnite/studio-shared';

import type { CaptureDesktopSource, CaptureElectron, CaptureImage } from './port';

/**
 * Stills (Phase 113 Theme K): a whole screen, one window, or a region of a frozen screen.
 *
 * Taken in main from `desktopCapturer`'s thumbnails at the display's full pixel size — no stream, no
 * renderer involvement beyond the click. A region is two steps: {@link freezeScreen} grabs the screen
 * once and keeps it **in memory** (one pending frame at a time, expiring), the user drags a rectangle on
 * its scaled preview inside the app window, and {@link cropFrame} cuts that rectangle from the full-size
 * frame. A dismissed picker leaves nothing on disk.
 *
 * Where the rectangle is dragged is the composer's: the desktop-wide overlay (`overlay.ts`), a window over
 * the display that shows this same frozen frame at full size, or — when no overlay can open — the scaled
 * preview inside the app window. Either way the screen is grabbed once and cut in main.
 */

/** Pixel size of the largest display, the thumbnail size a full-resolution grab asks for. */
export function fullPixelSize(el: Pick<CaptureElectron, 'displays'>): {
  width: number;
  height: number;
} {
  let width = 1;
  let height = 1;
  for (const d of el.displays()) {
    width = Math.max(width, Math.round(d.size.width * d.scaleFactor));
    height = Math.max(height, Math.round(d.size.height * d.scaleFactor));
  }
  return { width, height };
}

/** The picker's list: small thumbnails as data URLs. */
export async function listSources(
  el: CaptureElectron,
  kind: CaptureSourceKind,
): Promise<CaptureSource[]> {
  const sources = await el.getSources({
    types: [kind],
    thumbnailSize: { width: 320, height: 200 },
  });
  return sources
    .filter((s) => s.id.startsWith(`${kind}:`))
    .map((s) => ({
      id: s.id,
      kind,
      name: s.name,
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
    }));
}

/** One source at full resolution, or null when it is gone (a window closed since the picker listed it). */
export async function grabSource(
  el: CaptureElectron,
  kind: CaptureSourceKind,
  match: (source: CaptureDesktopSource) => boolean,
): Promise<CaptureDesktopSource | null> {
  const sources = await el.getSources({ types: [kind], thumbnailSize: fullPixelSize(el) });
  const found = sources.find(match);
  if (!found || found.thumbnail.isEmpty()) return null;
  return found;
}

/** The screen under the pointer, as a source match. */
export function underPointer(
  el: Pick<CaptureElectron, 'displayUnderPointer'>,
): (s: CaptureDesktopSource) => boolean {
  const display = String(el.displayUnderPointer().id);
  return (s) => s.display_id === display;
}

// --- region --------------------------------------------------------------------------

export const PENDING_TTL_MS = 5 * 60_000;
/** The picker's preview is at most this wide: the frame itself never leaves main. */
export const PREVIEW_MAX_WIDTH = 1600;

export type PendingFrame = { frame: CaptureRegionFrame; image: CaptureImage; at: number };

export type RegionState = {
  freeze: (image: CaptureImage, sourceName: string) => CaptureRegionFrame;
  pending: () => CaptureRegionFrame | null;
  /** The live frame for `pendingId` without taking it (the overlay reads the full image). */
  peek: (pendingId: string) => PendingFrame | null;
  take: (pendingId: string) => PendingFrame | null;
  cancel: (pendingId: string) => void;
};

export function createRegionState(now: () => number = Date.now): RegionState {
  let current: PendingFrame | null = null;
  const live = () => {
    if (current && now() - current.at > PENDING_TTL_MS) current = null;
    return current;
  };
  return {
    freeze: (image, sourceName) => {
      const { width, height } = image.getSize();
      const scaled =
        width > PREVIEW_MAX_WIDTH
          ? image.resize({ width: PREVIEW_MAX_WIDTH, quality: 'good' })
          : image;
      const jpeg = scaled.toJPEG(80);
      const frame: CaptureRegionFrame = {
        pendingId: `pend-${randomBytes(6).toString('hex')}`,
        preview: `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`,
        width,
        height,
        sourceName,
      };
      current = { frame, image, at: now() };
      return frame;
    },
    pending: () => live()?.frame ?? null,
    peek: (pendingId) => {
      const found = live();
      return found && found.frame.pendingId === pendingId ? found : null;
    },
    take: (pendingId) => {
      const found = live();
      if (!found || found.frame.pendingId !== pendingId) return null;
      current = null;
      return found;
    },
    cancel: (pendingId) => {
      if (current?.frame.pendingId === pendingId) current = null;
    },
  };
}

/** The pixel rectangle a fractional region covers, clamped inside the frame and at least 1×1. */
export function regionPixels(
  rect: CaptureRegionRect,
  size: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const x = Math.min(size.width - 1, Math.max(0, Math.round(rect.x * size.width)));
  const y = Math.min(size.height - 1, Math.max(0, Math.round(rect.y * size.height)));
  const width = Math.max(1, Math.min(size.width - x, Math.round(rect.width * size.width)));
  const height = Math.max(1, Math.min(size.height - y, Math.round(rect.height * size.height)));
  return { x, y, width, height };
}
