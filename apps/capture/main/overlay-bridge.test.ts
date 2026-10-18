// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { CAPTURE_OVERLAY_ARG, CHANNELS } from '@midnite/studio-shared';

import { createOverlayBridge, overlayTokenFrom } from './overlay-bridge';

describe('createOverlayBridge', () => {
  it('exposes exactly the three overlay calls, each carrying the window token', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const argv = ['electron', '--type=renderer', `${CAPTURE_OVERLAY_ARG}ovl-0123456789abcdef`];
    const overlay = createOverlayBridge({ invoke }, argv);
    expect(Object.keys(overlay).sort()).toEqual(['cancel', 'confirm', 'frame']);
    await overlay.frame();
    await overlay.confirm({ x: 0, y: 0, width: 1, height: 1 });
    await overlay.cancel();
    expect(invoke.mock.calls).toEqual([
      [CHANNELS.captureOverlayFrame, { token: 'ovl-0123456789abcdef' }],
      [
        CHANNELS.captureOverlayConfirm,
        { token: 'ovl-0123456789abcdef', rect: { x: 0, y: 0, width: 1, height: 1 } },
      ],
      [CHANNELS.captureOverlayCancel, { token: 'ovl-0123456789abcdef' }],
    ]);
  });

  it('has no token outside an overlay window — main then refuses every call', () => {
    expect(overlayTokenFrom(['electron'])).toBe('');
  });
});
