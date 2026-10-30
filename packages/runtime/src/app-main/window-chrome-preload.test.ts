import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared';
import { describe, expect, it, vi } from 'vitest';

import type { RendererIpc } from './bridge-slice';
import { createWindowChromeBridge } from './window-chrome-preload';

const ipc = (): RendererIpc => ({ invoke: vi.fn(), send: vi.fn(), on: vi.fn(), removeListener: vi.fn() });

describe('createWindowChromeBridge', () => {
  it('reads frameless from the launch argument', () => {
    expect(createWindowChromeBridge(ipc(), ['x', '--mstudio-frameless=1'], 'darwin').frameless).toBe(true);
    expect(createWindowChromeBridge(ipc(), ['--mstudio-frameless=0'], 'linux').frameless).toBe(false);
  });

  it('is framed when the argument is missing', () => {
    expect(createWindowChromeBridge(ipc(), ['--other=1'], 'darwin').frameless).toBe(false);
  });

  it('subscribes fullscreen and focus to the one state channel, with teardown', () => {
    const i = ipc();
    const bridge = createWindowChromeBridge(i, [], 'darwin');
    const onFull = vi.fn();
    const off = bridge.onFullscreenChange(onFull);
    expect(i.on).toHaveBeenCalledWith(EVENT_CHANNELS.windowStateChanged, expect.any(Function));
    const listener = (i.on as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    listener({}, { fullScreen: true, focused: false });
    expect(onFull).toHaveBeenCalledWith(true);
    off();
    expect(i.removeListener).toHaveBeenCalledWith(EVENT_CHANNELS.windowStateChanged, listener);
  });

  it('sends the maximise toggle for a double-click on the drag region', () => {
    const i = ipc();
    createWindowChromeBridge(i, [], 'darwin').toggleMaximize?.();
    expect(i.send).toHaveBeenCalledWith(CHANNELS.windowMaximizeToggle, undefined);
  });
});
