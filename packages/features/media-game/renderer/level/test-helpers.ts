import { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';

import { buildBlankLevel } from './new-scene-model';

export const blankLevel = () => buildBlankLevel({ width: 4, height: 3, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: 'ground' });

/** A 20 x 20 m plan (640 px at 32 px a tile, one metre a tile) with the template's spawn at its centre, (336, 336) px. */
export const blankLevel3d = () => buildBlankLevel({ width: 20, height: 20, tilewidth: 32, tileheight: 32, orientation: 'orthogonal', baseLayer: null });

export const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

type Bridge = {
  list?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  set?: ReturnType<typeof vi.fn>;
  mapAsset?: ReturnType<typeof vi.fn>;
  goto?: ReturnType<typeof vi.fn>;
  manifestGet?: ReturnType<typeof vi.fn>;
  manifestSet?: ReturnType<typeof vi.fn>;
};

export function installBridge(b: Bridge): void {
  (window as unknown as { midniteStudio: unknown }).midniteStudio = {
    games: {
      levels: { list: b.list ?? vi.fn(), get: b.get ?? vi.fn(), set: b.set ?? vi.fn(), mapAsset: b.mapAsset ?? vi.fn() },
      goto: b.goto ?? vi.fn(),
      manifest: { get: b.manifestGet ?? vi.fn(), set: b.manifestSet ?? vi.fn() },
    },
  };
}

export function removeBridge(): void {
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
}

/** jsdom has no 2D canvas; the editor skips drawing when there is no context. */
export function stubCanvas(): void {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
}

/** jsdom lacks `PointerEvent`, so `fireEvent.pointerDown` would drop `clientX`/`button`; a `MouseEvent` carries them. */
export function stubPointerEvents(): void {
  if (typeof window.PointerEvent === 'function') return;
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventStub;
}
