// vitest/jsdom: the overlay page's DOM and the calls it makes over a fake overlay bridge — no window is
// opened, nothing is grabbed; the "frozen frame" is a literal data URL.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CAPTURE_OVERLAY_GLOBAL, type CaptureOverlayBridge } from '@midnite/studio-shared';

import html from './capture-overlay.html?raw';
import { mountCaptureOverlay, OVERLAY_GLOBAL_NAME, type OverlayPage } from './overlay-page';

const box = { left: 0, top: 0, width: 1000, height: 500 };
let page: OverlayPage | null = null;
afterEach(() => {
  page?.dispose();
  page = null;
  document.body.innerHTML = '';
});

function fakeApi(
  frame: Awaited<ReturnType<CaptureOverlayBridge['frame']>> = {
    ok: true,
    value: {
      image: 'data:image/jpeg;base64,AA==',
      width: 2000,
      height: 1000,
      sourceName: 'Studio Display',
    },
  },
) {
  return {
    frame: vi.fn(async () => frame),
    confirm: vi.fn(async () => ({ ok: false as const, kind: 'error' as const, message: 'x' })),
    cancel: vi.fn(async () => ({ ok: true as const })),
  };
}

async function mount(api = fakeApi()) {
  page = mountCaptureOverlay(document.body, api as unknown as CaptureOverlayBridge, {
    measure: () => box,
  });
  await vi.waitFor(() => expect(api.frame).toHaveBeenCalled());
  await Promise.resolve();
  await Promise.resolve();
  return api;
}

const surface = () => document.querySelector('[data-testid="capture-overlay"]') as HTMLElement;
const pointer = (type: string, x: number, y: number) =>
  surface().dispatchEvent(
    Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }), {
      pointerId: 1,
    }),
  );
const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));

describe('capture overlay page', () => {
  it('shows the frozen frame and confirms the dragged rectangle on mouse-up, once', async () => {
    const api = await mount();
    const img = surface().querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,AA==');
    pointer('pointerdown', 250, 125);
    pointer('pointermove', 500, 250);
    expect(document.querySelector('[data-testid="capture-overlay-label"]')?.textContent).toBe(
      '500 × 250',
    );
    pointer('pointerup', 500, 250);
    expect(api.confirm).toHaveBeenCalledWith({ x: 0.25, y: 0.25, width: 0.25, height: 0.25 });
    key('Enter');
    key('Escape');
    pointer('pointerdown', 0, 0);
    pointer('pointerup', 900, 400);
    expect(api.confirm).toHaveBeenCalledTimes(1);
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('a click selects nothing; Enter then takes the whole screen', async () => {
    const api = await mount();
    pointer('pointerdown', 300, 300);
    pointer('pointerup', 300, 300);
    expect(api.confirm).not.toHaveBeenCalled();
    key('Enter');
    expect(api.confirm).toHaveBeenCalledWith({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('Escape cancels and saves nothing', async () => {
    const api = await mount();
    key('Escape');
    expect(api.cancel).toHaveBeenCalledTimes(1);
    key('Enter');
    expect(api.confirm).not.toHaveBeenCalled();
  });

  it('a right-click cancels too', async () => {
    const api = await mount();
    surface().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(api.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when the frozen frame is gone, and takes nothing before it arrives', async () => {
    const api = fakeApi({ ok: false, kind: 'error', message: 'The frozen frame expired.' });
    await mount(api);
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="capture-overlay-label"]')?.textContent).toBe(
      'The frozen frame expired.',
    );
  });

  it('names the same global the preloads expose', () => {
    expect(OVERLAY_GLOBAL_NAME).toBe(CAPTURE_OVERLAY_GLOBAL);
  });

  it('ships a page with its own strict CSP that loads only the script beside it', () => {
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain('img-src data:');
    expect(html).not.toMatch(/https?:\/\//);
    expect([...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])).toEqual([
      '<script src="./capture-overlay.js">',
    ]);
  });
});
