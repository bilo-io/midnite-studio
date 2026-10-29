import { useEffect } from 'react';

import { clampZoomFactor, originOf, useBrowserStore, ZOOM_STEP } from '@midnite/studio-feature-browser/renderer';
import { bridge } from '@midnite/studio-frame';
import { COMMANDS, type CommandId } from '@midnite/studio-shared';

/**
 * Browser's keyboard: the browser's own tab and page commands, on the chords the shared registry gives
 * them (`shared/src/keybindings.ts` — Mod+t, Mod+w, Mod+Shift+t, Ctrl+Tab, Mod+1…9, Mod+f, Mod+=/-/0).
 * Studio runs these through its command dispatcher, gated on the pane being open; in Browser the pane is
 * always open, so they are always live. A focused page swallows its keystrokes before the window sees
 * them, so main hands Mod+t and Mod+w back as `menu.onCommand` (`browser-service.ts`'s
 * `before-input-event`), and both routes land here.
 */
export const BROWSER_KEY_COMMANDS = [
  'browser.newTab',
  'browser.closeTab',
  'browser.nextTab',
  'browser.prevTab',
  'browser.reopenTab',
  'browser.selectTab1',
  'browser.selectTab2',
  'browser.selectTab3',
  'browser.selectTab4',
  'browser.selectTab5',
  'browser.selectTab6',
  'browser.selectTab7',
  'browser.selectTab8',
  'browser.selectTab9',
  'browser.find',
  'browser.zoomIn',
  'browser.zoomOut',
  'browser.zoomReset',
] as const satisfies readonly CommandId[];

type BrowserKeyCommand = (typeof BROWSER_KEY_COMMANDS)[number];

const isMac = (): boolean => typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);

/** The keymap's chord string for a keystroke (Studio's `chordFromEvent` rule: Mod, Ctrl, Alt, Shift, key). */
export function chordOf(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): string | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return null;
  const mac = isMac();
  const parts: string[] = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (mac && event.ctrlKey) parts.push('Ctrl');
  if (!mac && event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return parts.join('+');
}

const CHORDS: ReadonlyMap<string, BrowserKeyCommand> = new Map(
  COMMANDS.flatMap((command) =>
    'chord' in command && command.chord && (BROWSER_KEY_COMMANDS as readonly string[]).includes(command.id)
      ? [[command.chord, command.id as BrowserKeyCommand] as const]
      : [],
  ),
);

/** Runs one of the browser's commands against the feature's tab store — Studio's handlers, verbatim. */
export function runBrowserCommand(id: BrowserKeyCommand): void {
  const store = useBrowserStore.getState();
  const nth = /^browser\.selectTab(\d)$/.exec(id);
  if (nth) {
    store.activateNth(Number(nth[1]));
    return;
  }
  const active = store.tabs.find((tab) => tab.id === store.activeTabId) ?? null;
  const zoomBy = (delta: number) => {
    if (!active || active.kind !== 'page') return;
    const origin = originOf(active.url);
    if (!origin) return;
    const next = clampZoomFactor(delta === 0 ? 1 : (store.zoomByOrigin[origin] ?? 1) + delta);
    store.setZoomForOrigin(origin, next);
    bridge()?.browser.zoom({ tabId: active.id, factor: next });
  };
  switch (id) {
    case 'browser.newTab':
      store.openTab();
      return;
    case 'browser.closeTab':
      if (store.activeTabId) store.closeTab(store.activeTabId);
      return;
    case 'browser.nextTab':
      store.cycleTab(1);
      return;
    case 'browser.prevTab':
      store.cycleTab(-1);
      return;
    case 'browser.reopenTab':
      store.reopenClosed();
      return;
    case 'browser.find':
      if (active?.kind === 'page') store.toggleFind();
      return;
    case 'browser.zoomIn':
      zoomBy(ZOOM_STEP);
      return;
    case 'browser.zoomOut':
      zoomBy(-ZOOM_STEP);
      return;
    case 'browser.zoomReset':
      zoomBy(0);
      return;
    default:
      return;
  }
}

const isBrowserKeyCommand = (id: unknown): id is BrowserKeyCommand => (BROWSER_KEY_COMMANDS as readonly unknown[]).includes(id);

export function useBrowserKeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const chord = chordOf(event);
      const id = chord ? CHORDS.get(chord) : undefined;
      if (!id) return;
      event.preventDefault();
      runBrowserCommand(id);
    };
    window.addEventListener('keydown', onKey);
    const off = bridge()?.menu.onCommand((command) => {
      if (isBrowserKeyCommand(command)) runBrowserCommand(command);
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, []);
}
