/**
 * Tie the system-metrics sampler to whether anyone can see the window (Phase 123 Theme K).
 *
 * Blur, hide and minimise pause it; focus, show and restore resume it; closing stops it. A
 * hidden app must not spawn `ioreg` every few seconds for hours, for a sparkline nobody is
 * looking at. One implementation for Studio's main and every suite app's, so the pause rule
 * cannot drift between them. Structural on both sides: the runtime imports no `electron`.
 */
export type PausableWindow = {
  on(event: 'blur' | 'focus' | 'hide' | 'show' | 'minimize' | 'restore' | 'closed', listener: () => void): unknown;
};

export type PausableSampler = { pause(): void; resume(): void; stop(): void };

export function bindMetricsToWindow(win: PausableWindow, service: PausableSampler): void {
  win.on('blur', () => service.pause());
  win.on('focus', () => service.resume());
  win.on('hide', () => service.pause());
  win.on('show', () => service.resume());
  win.on('minimize', () => service.pause());
  win.on('restore', () => service.resume());
  win.on('closed', () => service.stop());
}
