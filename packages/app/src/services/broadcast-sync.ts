import { useEffect, useRef } from 'react';

import type { WatchKind } from '@midnite/studio-shared';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { bridge } from './bridge';
import { invalidateForWatchKind } from './watch-invalidation';
import { useFilesStore } from '../features/files/files-store';
import { usePaletteStore } from '../features/themes/palette-store';
import { useActionsStore, type ActionsState } from '../store/actions-store';
import { useAppearanceStore, type AppearanceState } from '../store/appearance-store';
import { useBrowserStore, type BrowserTab, type BrowserTabGroup } from '../store/browser-store';
import { useUiStore, type UiState } from '../store/ui-store';
import { useWorkbenchStore, type WorkbenchTab } from '../store/workbench-store';

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
 *
 * **Theme H widened that list once, for page popouts.** Pages detach by
 * duplicating (`PAGE_WINDOW_ROLES`), so the same view can be live in two
 * windows at once, and the per-view *selection* each one holds is renderer
 * state no relay carried: which run Actions has open, which file the Explorer
 * has open, which tabs the Changes workbench holds. Those three now travel.
 *
 * What deliberately does NOT travel is the line the same widening could easily
 * have crossed: view **furniture** — `files-store.expanded`,
 * `actions-store.collapsedWorkflows`, `file-editor-store`'s target line. Those
 * are disclosure and scroll state, and syncing them is the pane-size fight the
 * paragraph above rules out: expanding a directory in the popout would snap the
 * main window's tree open under the user's cursor. Selection is a shared answer
 * to "what am I looking at"; furniture is how one particular window is
 * arranged to look at it.
 */

const CHANNEL_NAME = 'midnite-studio';

/** `@bilo-io/ui`'s own key, mirrored here so an applied theme survives a reload. */
const THEME_STORAGE_KEY = 'midnite.theme';
const MAX_SEEN_IDS = 200;

type SyncKind =
  | 'ui'
  | 'appearance'
  | 'browser'
  | 'theme'
  | 'watch'
  | 'actions'
  | 'files'
  | 'workbench';
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

/**
 * The last theme this window is known to be showing, and the palette with it.
 *
 * **Module-level, not closure-level, and that is the whole fix for the flicker.**
 * `applying` cannot protect the theme observer the way it protects the zustand
 * subscribers: a zustand subscriber runs synchronously inside `applyIncoming`,
 * where the flag is still true, but a `MutationObserver` callback is delivered
 * as a MICROTASK — it runs after `applyIncoming`'s `finally` has already set
 * `applying` back to false. So every relayed theme message made the receiving
 * window immediately rebroadcast it.
 *
 * With two windows that echo damps out. With three — a main window and two
 * detached pages, which page detachment made ordinary — it does not: each
 * window's rebroadcast reaches the other two, each of which rebroadcasts to
 * two more, and the class flips on `<html>` many times a second. That is the
 * flicker.
 *
 * Recording the value here, from inside `applyTheme`, closes it at the source:
 * the observer that fires a microtask later sees the class it already knows
 * about and returns before sending anything.
 */
let lastDark = typeof document === 'undefined' ? false : document.documentElement.classList.contains('dark');
let lastPaletteId: string | null = null;

function applyTheme(dark: boolean, paletteId?: string): void {
  const root = document.documentElement;
  // Recorded BEFORE the mutation, so the observer's microtask cannot land in
  // the window between the class changing and this being updated.
  lastDark = dark;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  /*
    Keep `ThemeProvider`'s own source of truth in step.

    `@bilo-io/ui`'s provider reads `localStorage['midnite.theme']` once on mount
    and thereafter drives the class off React state. Writing the class without
    writing the key leaves the DOM and that state disagreeing, so the next
    remount of this window — a reload, a re-open — snaps back to the old theme
    and broadcasts the snap.

    Always the RESOLVED value, never `'system'`, even when the OS happens to
    agree right now. A relayed message says what the sending window resolved
    to; storing `'system'` because the two currently coincide would silently
    re-point this window at the OS, so a later OS flip would move a theme the
    user had explicitly chosen. `'system'` remains reachable — it is what the
    theme toggle writes, and this path never runs unless another window
    actually changed something.
  */
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
  } catch {
    // A window with storage denied still applies the class; it just will not
    // remember across a reload, which is the pre-existing behaviour anyway.
  }
  // Phase 64 Theme B: the palette change reaches popouts on the SAME
  // message the dark-class flip already travels on, rather than a second
  // channel — `applying` is already true around this whole call (see
  // `applyIncoming`), so `usePaletteStore`'s own subscriber below stays
  // quiet and this does not ping-pong back out.
  if (paletteId) {
    lastPaletteId = paletteId;
    usePaletteStore.getState().setActivePalette(paletteId);
  }
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
      case 'actions':
        useActionsStore.setState(message.payload as unknown as ActionsSlice);
        break;
      case 'files':
        /*
          `scopeKey` rides along with the path rather than being left to each
          window's own `ensureScope`. The two are one fact — a relPath means
          nothing without the checkout it is relative to — and applying a path
          under a stale scope would point the Explorer at a file in a different
          repository. Both windows converge on the same scope anyway, since
          `selectedRepoId`/`selectedWorktreePath` travel on the `ui` message;
          this only removes the window between the two arriving.
        */
        useFilesStore.setState(message.payload as unknown as FilesSlice);
        break;
      case 'workbench':
        useWorkbenchStore.setState(message.payload as unknown as WorkbenchSlice);
        break;
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

/*
  Theme H's three page-selection slices. Each is the *selection* its view
  holds and nothing else — see the module doc on why furniture stays local.
*/

type ActionsSlice = Pick<ActionsState, 'selectedRun' | 'selectedJob'>;

function pickActions(state: ActionsState): ActionsSlice {
  // `selectedJob` comes along because `selectRun` clears it in the same
  // update: relaying the run alone would leave the other window showing a job
  // name from the previous run, which resolves to nothing in the new model.
  return { selectedRun: state.selectedRun, selectedJob: state.selectedJob };
}

type FilesSlice = { scopeKey: string | null; selectedPath: string | null };

function pickFiles(state: FilesSlice): FilesSlice {
  return { scopeKey: state.scopeKey, selectedPath: state.selectedPath };
}

type WorkbenchSlice = { tabs: WorkbenchTab[]; activeTabId: string | null };

function pickWorkbench(state: WorkbenchSlice): WorkbenchSlice {
  return { tabs: state.tabs, activeTabId: state.activeTabId };
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

    let lastActions = pickActions(useActionsStore.getState());
    const unsubActions = useActionsStore.subscribe((state) => {
      if (applying) return;
      const next = pickActions(state);
      if (shallowEqual(next, lastActions)) return;
      lastActions = next;
      send('actions', next);
    });

    let lastFiles = pickFiles(useFilesStore.getState());
    const unsubFiles = useFilesStore.subscribe((state) => {
      if (applying) return;
      const next = pickFiles(state);
      if (shallowEqual(next, lastFiles)) return;
      lastFiles = next;
      send('files', next);
    });

    let lastWorkbench = pickWorkbench(useWorkbenchStore.getState());
    const unsubWorkbench = useWorkbenchStore.subscribe((state) => {
      if (applying) return;
      const next = pickWorkbench(state);
      if (shallowEqual(next, lastWorkbench)) return;
      lastWorkbench = next;
      send('workbench', next);
    });

    // ThemeProvider (`@bilo-io/ui`) exposes no change listener, so the `dark`
    // class it writes on `<html>` is observed instead — the same signal
    // `useWindowBackgroundSync` (`app.tsx`) already keys its own resync off.
    //
    // `lastDark`/`lastPaletteId` are module-level and are written by
    // `applyTheme` as well as here. That is deliberate and is what stops the
    // echo: see their declaration for why `applying` alone cannot guard a
    // MutationObserver.
    lastDark = document.documentElement.classList.contains('dark');
    lastPaletteId = usePaletteStore.getState().activePaletteId;
    const themeObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (applying) return;
            const dark = document.documentElement.classList.contains('dark');
            if (dark === lastDark) return;
            lastDark = dark;
            send('theme', { dark, paletteId: lastPaletteId ?? undefined });
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
      unsubActions();
      unsubFiles();
      unsubWorkbench();
      unsubPalette();
      themeObserver?.disconnect();
    };
  }, []);
}
