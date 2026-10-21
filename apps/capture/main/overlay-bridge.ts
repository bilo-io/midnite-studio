import type { RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { CaptureOverlayBridge } from '@midnite/studio-shared';
import { CAPTURE_OVERLAY_ARG, CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The desktop region overlay's bridge (Phase 113 Theme K slice 2) — what the overlay window's preload
 * exposes as `window.midniteCaptureOverlay`, and nothing else: three calls on exactly the three overlay
 * channels, each carrying this overlay's one-time token. No `midniteStudio`, no events, no other channel.
 *
 * The token is read from the window's own `process.argv` (main's `overlayWindowOptions` puts it on
 * `additionalArguments`) and stays here: the page never sees it, and main answers the overlay channels
 * only for the overlay open now.
 */
export function overlayTokenFrom(argv: readonly string[]): string {
  const arg = argv.find((a) => a.startsWith(CAPTURE_OVERLAY_ARG));
  return arg ? arg.slice(CAPTURE_OVERLAY_ARG.length) : '';
}

export function createOverlayBridge(
  ipc: Pick<RendererIpc, 'invoke'>,
  argv: readonly string[],
): CaptureOverlayBridge {
  const token = overlayTokenFrom(argv);
  return {
    frame: () =>
      ipc.invoke(CHANNELS.captureOverlayFrame, { token }) as ReturnType<
        CaptureOverlayBridge['frame']
      >,
    confirm: (rect) =>
      ipc.invoke(CHANNELS.captureOverlayConfirm, { token, rect }) as ReturnType<
        CaptureOverlayBridge['confirm']
      >,
    cancel: () =>
      ipc.invoke(CHANNELS.captureOverlayCancel, { token }) as ReturnType<
        CaptureOverlayBridge['cancel']
      >,
  };
}
