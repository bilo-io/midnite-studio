import { useEffect, useRef } from 'react';

import type { WatchKind } from '@midnite/studio-shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { bridge } from './bridge';
import { invalidateForWatchKind } from './watch-invalidation';
import { usePaletteStore } from '../features/themes/palette-store';
import { useAppearanceStore, type AppearanceState } from '../store/appearance-store';
import { useBrowserStore, type BrowserTab, type BrowserTabGroup } from '../store/browser-store';
import { useUiStore, type UiState } from '../store/ui-store';

/**
 * Cross-window state synchronization (Theme E).
 *
 * Two transports, one authority. The main-process relay (`bridge().window.relay`
 * / `onRelayed`, rebroadcast by `relayToOtherWindows` in `window-manager.ts`) is
 * authoritative and always runs; `BroadcastChannel` is a same-origin fast path
 * layered on top. The relay cannot be the untested half: in the packaged build
 * renderers load from `file://`, where origins are opaque and `BroadcastChannel`
 * may never fire between windows — dev (`http://localhost:5173`) would pass
 * while the shipped app silently desynced. Both are sent on every local change,
 * and messages are de-duplicated by a per-message `id` so a payload arriving on
 * both applies once.
 *
 * The allowlist is deliberately narrow, not a whole-store mirror: `ui-store`
 * persists ~60 fields, and syncing all of them would have two windows fighting
 * over pane sizes. Only `selectedRepoId`, `selectedWorktreePath`, the four
 * `*Detached` flags, the whole of `appearance-store`, `browser-store` (tabs,
 * groups, `activeTabId` — both windows can render the strip after Theme D), and
 * theme flips travel. `terminal-store` does NOT sync — it is deliberately
 * unpersisted, main owns terminal durability via `terminals.json`, and a synced
 * second copy would be exactly the drifting duplicate its module doc warns
 * against.
 */

const CHANNEL_NAME = 'midnite-studio';
const MAX_SEEN_IDS = 200;

type SyncKind = 'ui' | 'appearance' | 'browser' | 'theme' | 'watch';
type SyncMessage = { id: string; origin: string; kind: SyncKind; payload: Record<string, unknown> };

const newId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/** A per-renderer-lifetime id — not Electron's numeric window id, so the same value works for both transports. */
const localOrigin = newId();

const seenIds = new Set<string>();

/** Bounded FIFO — a long-lived window must not grow this set forever. */
function alreadySeen(id: string): boolean {
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  if (seenIds.size > MAX_SEEN_IDS) {
    const oldest = seenIds.values().next().value;
    if (oldest !== undefined) seenIds.delete(oldest);
  }
  return false;
}

/**
 * Suppresses the subscriber that would otherwise rebroadcast a message this
 * window just applied — without it, two windows ping-pong a single change
 * forever. Module-level rather than per-store: one incoming message can touch
 * several stores in principle, and every subscriber below must stay quiet
 * for the whole of `applyIncoming`.
 */
let applying = false;

let channel: BroadcastChannel | null = null;
try {
  channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
} catch {
  channel = null;
}

function send(kind: SyncKind, payload: Record<string, unknown>): void {
  if (applying) return;
  const message: SyncMessage = { id: newId(), origin: localOrigin, kind, payload };
  try {
    channel?.postMessage(message);
  } catch {
    // The fast path is optional — the relay below still delivers it.
  }
  bridge()?.window.relay(message);
}

/**
 * Called by `watch-invalidation.ts`'s main-window-only subscriber (the single
 * watcher stays bound to main; every other window invalidates off this relay
 * rather than running a second `git status` poll of its own).
 */
export function relayWatchEvent(repoId: string, kind: WatchKind): void {
  send('watch', { repoId, kind });
}

function applyTheme(dark: boolean, paletteId?: string): void {
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  // Phase 64 Theme B: the palette change reaches popouts on the SAME
  // message the dark-class flip already travels on, rather than a second
  // channel — `applying` is already true around this whole call (see
  // `applyIncoming`), so `usePaletteStore`'s own subscriber below stays
  // quiet and this does not ping-pong back out.
  if (paletteId) usePaletteStore.getState().setActivePalette(paletteId);
}

function applyIncoming(message: SyncMessage, client: QueryClient): void {
  applying = true;
  try {
    switch (message.kind) {
      case 'ui':
        useUiStore.setState(message.payload as Partial<UiState>);
        break;
      case 'appearance':
        useAppearanceStore.setState(message.payload as Partial<AppearanceState>);
        break;
      case 'browser':
        useBrowserStore.setState(
          message.payload as unknown as {
            tabs: BrowserTab[];
            groups: BrowserTabGroup[];
            activeTabId: string | null;
          },
        );
        break;
      case 'theme': {
        const paletteId = message.payload['paletteId'];
        applyTheme(Boolean(message.payload['dark']), typeof paletteId === 'string' ? paletteId : undefined);
        break;
      }
      case 'watch': {
        const { repoId, kind } = message.payload as { repoId: string; kind: WatchKind };
        invalidateForWatchKind(client, repoId, kind);
        break;
      }
    }
  } finally {
    applying = false;
  }
}

type UiSlice = Pick<
  UiState,
  | 'selectedRepoId'
  | 'selectedWorktreePath'
  | 'terminalDetached'
  | 'reposDetached'
  | 'fabDetached'
  | 'browserDetached'
>;

function pickUi(state: UiState): UiSlice {
  return {
    selectedRepoId: state.selectedRepoId,
    selectedWorktreePath: state.selectedWorktreePath,
    terminalDetached: state.terminalDetached,
    reposDetached: state.reposDetached,
    fabDetached: state.fabDetached,
    browserDetached: state.browserDetached,
  };
}

type AppearanceSlice = Pick<
  AppearanceState,
  'accent' | 'motion' | 'density' | 'uiFont' | 'background' | 'bgIntensity' | 'effects' | 'shimmer'
>;

function pickAppearance(state: AppearanceState): AppearanceSlice {
  return {
    accent: state.accent,
    motion: state.motion,
    density: state.density,
    uiFont: state.uiFont,
    background: state.background,
    bgIntensity: state.bgIntensity,
    effects: state.effects,
    shimmer: state.shimmer,
  };
}

type BrowserSlice = { tabs: BrowserTab[]; groups: BrowserTabGroup[]; activeTabId: string | null };

function pickBrowser(state: BrowserSlice): BrowserSlice {
  return { tabs: state.tabs, groups: state.groups, activeTabId: state.activeTabId };
}

/**
 * Shallow, `===`-per-field — sound here because every producing store follows
 * the same immutable-update convention `partialize`/`merge` already assume: a
 * changed field gets a new reference, an untouched one keeps its old one.
 */
function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Mount once per window — both `App()` (main) and `DetachedRoot` (every
 * popout) call this, so the allowlisted slice above reaches every open
 * window rather than just the one the user is looking at.
 *
 * A window that mounts mid-session relies on its own persisted stores
 * (already hydrated from `localStorage` at boot, same as the main window) for
 * its starting values rather than requesting a snapshot from anywhere —
 * there is no single process that holds authoritative copies of these
 * renderer-side stores to request one from. From the moment this effect
 * subscribes, it stays current via the relay like every other window.
 */
export function useBroadcastSync(): void {
  const client = useQueryClient();
  const clientRef = useRef(client);
  clientRef.current = client;

  useEffect(() => {
    const onMessage = (message: SyncMessage): void => {
      if (message.origin === localOrigin || alreadySeen(message.id)) return;
      applyIncoming(message, clientRef.current);
    };

    const onChannelMessage = (event: MessageEvent<SyncMessage>): void => onMessage(event.data);
    channel?.addEventListener('message', onChannelMessage);
    const unsubscribeRelay = bridge()?.window.onRelayed(onMessage);

    let lastUi = pickUi(useUiStore.getState());
    const unsubUi = useUiStore.subscribe((state) => {
      if (applying) return;
      const next = pickUi(state);
      if (shallowEqual(next, lastUi)) return;
      lastUi = next;
      send('ui', next);
    });

    let lastAppearance = pickAppearance(useAppearanceStore.getState());
    const unsubAppearance = useAppearanceStore.subscribe((state) => {
      if (applying) return;
      const next = pickAppearance(state);
      if (shallowEqual(next, lastAppearance)) return;
      lastAppearance = next;
      send('appearance', next);
    });

    let lastBrowser = pickBrowser(useBrowserStore.getState());
    const unsubBrowser = useBrowserStore.subscribe((state) => {
      if (applying) return;
      const next = pickBrowser(state);
      if (shallowEqual(next, lastBrowser)) return;
      lastBrowser = next;
      send('browser', next);
    });

    // ThemeProvider (`@bilo-io/ui`) exposes no change listener, so the `dark`
    // class it writes on `<html>` is observed instead — the same signal
    // `useWindowBackgroundSync` (`app.tsx`) already keys its own resync off.
    let lastDark = document.documentElement.classList.contains('dark');
    // Phase 64 Theme B: the active palette travels on the same `'theme'`
    // message rather than a new channel — see `applyTheme`.
    let lastPaletteId = usePaletteStore.getState().activePaletteId;
    const themeObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (applying) return;
            const dark = document.documentElement.classList.contains('dark');
            if (dark === lastDark) return;
            lastDark = dark;
            send('theme', { dark, paletteId: lastPaletteId });
          });
    themeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const unsubPalette = usePaletteStore.subscribe((state) => {
      if (applying) return;
      if (state.activePaletteId === lastPaletteId) return;
      lastPaletteId = state.activePaletteId;
      send('theme', { dark: lastDark, paletteId: lastPaletteId });
    });

    return () => {
      channel?.removeEventListener('message', onChannelMessage);
      unsubscribeRelay?.();
      unsubUi();
      unsubAppearance();
      unsubBrowser();
      unsubPalette();
      themeObserver?.disconnect();
    };
  }, []);
}
