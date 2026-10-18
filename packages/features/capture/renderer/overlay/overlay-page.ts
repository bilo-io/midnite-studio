import type { CaptureOverlayBridge, CaptureRegionRect } from '@midnite/studio-shared';

import { rectFromPoints, WHOLE_FRAME, type Box } from '../region-rect';

/**
 * The desktop region overlay's page (Phase 113 Theme K slice 2) — plain DOM, no React and no app bundle,
 * so the window it runs in loads one small script and nothing else. It shows the frozen frame main
 * already grabbed (fetched once through the overlay bridge), dims it, and lets the user drag a crosshair
 * rectangle over it:
 *
 * - **mouse-up after a real drag** confirms that rectangle;
 * - **Enter** confirms the rectangle, or the whole screen when nothing is selected;
 * - **Escape** cancels.
 *
 * Only the rectangle — fractions of the frame — goes back; main cuts it from the full-size frame it kept,
 * so nothing is grabbed twice. After the first confirm or cancel the page ignores every further input:
 * main closes the window on either. The window's blur closes it too (main's side, not this page's).
 */

/**
 * The global the overlay preload exposes the bridge under. Spelled here rather than imported:
 * `CAPTURE_OVERLAY_GLOBAL` lives in shared's barrel, which would pull zod into a bundle that only needs a
 * string. The page's test holds the two equal.
 */
export const OVERLAY_GLOBAL_NAME = 'midniteCaptureOverlay';

export type OverlayPageOptions = {
  /** The overlay's box on screen — the window itself. A test passes a fixed one. */
  measure?: () => Box;
};

export type OverlayPage = { dispose: () => void };

const DIM = 'rgb(0 0 0 / 0.35)';

export function mountCaptureOverlay(
  root: HTMLElement,
  api: CaptureOverlayBridge,
  options: OverlayPageOptions = {},
): OverlayPage {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const measure =
    options.measure ??
    ((): Box => ({
      left: 0,
      top: 0,
      width: view?.innerWidth ?? 0,
      height: view?.innerHeight ?? 0,
    }));

  let done = false;
  let start: { x: number; y: number } | null = null;
  let rect: CaptureRegionRect | null = null;

  const surface = doc.createElement('div');
  surface.setAttribute('data-testid', 'capture-overlay');
  surface.setAttribute('role', 'application');
  surface.setAttribute(
    'aria-label',
    'Choose a region — drag, Enter for the whole screen, Escape to cancel',
  );
  Object.assign(surface.style, {
    position: 'fixed',
    inset: '0',
    cursor: 'crosshair',
    userSelect: 'none',
    overflow: 'hidden',
  });

  const image = doc.createElement('img');
  image.alt = '';
  image.draggable = false;
  Object.assign(image.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  });

  // The dim over the whole frame until a rectangle is drawn; then the rectangle's shadow does it.
  const dim = doc.createElement('div');
  Object.assign(dim.style, {
    position: 'absolute',
    inset: '0',
    background: DIM,
    pointerEvents: 'none',
  });

  const selection = doc.createElement('div');
  selection.setAttribute('data-testid', 'capture-overlay-selection');
  Object.assign(selection.style, {
    position: 'absolute',
    display: 'none',
    border: '1px solid #fff',
    boxShadow: `0 0 0 99999px ${DIM}`,
    pointerEvents: 'none',
  });

  const label = doc.createElement('div');
  label.setAttribute('aria-live', 'polite');
  label.setAttribute('data-testid', 'capture-overlay-label');
  Object.assign(label.style, {
    position: 'absolute',
    left: '50%',
    top: '24px',
    transform: 'translateX(-50%)',
    padding: '4px 10px',
    borderRadius: '6px',
    background: 'rgb(0 0 0 / 0.7)',
    color: '#fff',
    font: '12px -apple-system, system-ui, sans-serif',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  label.textContent = 'Loading the frozen screen…';

  surface.append(image, dim, selection, label);
  root.append(surface);

  let frameSize: { width: number; height: number } | null = null;
  const hint = 'Drag to choose a region · Enter takes the whole screen · Escape cancels';

  const draw = () => {
    if (!rect) {
      selection.style.display = 'none';
      dim.style.display = 'block';
      if (frameSize) label.textContent = hint;
      return;
    }
    dim.style.display = 'none';
    Object.assign(selection.style, {
      display: 'block',
      left: `${rect.x * 100}%`,
      top: `${rect.y * 100}%`,
      width: `${rect.width * 100}%`,
      height: `${rect.height * 100}%`,
    });
    if (frameSize)
      label.textContent = `${Math.round(rect.width * frameSize.width)} × ${Math.round(rect.height * frameSize.height)}`;
  };

  const finish = (run: () => Promise<unknown>) => {
    if (done) return;
    done = true;
    void run().catch(() => undefined);
  };
  const confirm = (chosen: CaptureRegionRect) => finish(() => api.confirm(chosen));
  const cancel = () => finish(() => api.cancel());

  const point = (event: MouseEvent) => ({ x: event.clientX, y: event.clientY });

  const onDown = (event: PointerEvent) => {
    if (done || !frameSize || event.button !== 0) return;
    surface.setPointerCapture?.(event.pointerId);
    start = point(event);
    rect = null;
    draw();
  };
  const onMove = (event: PointerEvent) => {
    if (done || !start) return;
    rect = rectFromPoints(start, point(event), measure());
    draw();
  };
  const onUp = (event: PointerEvent) => {
    if (done || !start) return;
    rect = rectFromPoints(start, point(event), measure());
    start = null;
    draw();
    // A click (no real drag) selects nothing; a drag is confirmed on release.
    if (rect) confirm(rect);
  };
  const onKey = (event: KeyboardEvent) => {
    if (done) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && frameSize) {
      event.preventDefault();
      confirm(rect ?? WHOLE_FRAME);
    }
  };
  // A right-click is a way out too, never a context menu over the screen.
  const onContext = (event: MouseEvent) => {
    event.preventDefault();
    cancel();
  };

  surface.addEventListener('pointerdown', onDown);
  surface.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerup', onUp);
  surface.addEventListener('contextmenu', onContext);
  doc.addEventListener('keydown', onKey);

  void api
    .frame()
    .then((result) => {
      if (done) return;
      if (!result.ok) {
        label.textContent = result.kind === 'error' ? result.message : 'The frozen screen is gone.';
        cancel();
        return;
      }
      frameSize = { width: result.value.width, height: result.value.height };
      image.src = result.value.image;
      draw();
    })
    .catch(() => cancel());

  return {
    dispose: () => {
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('contextmenu', onContext);
      doc.removeEventListener('keydown', onKey);
      surface.remove();
    },
  };
}
