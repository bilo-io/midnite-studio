import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * The process-wide live-WebGL-context ceiling (Phase 51 Theme C).
 *
 * Chromium caps live WebGL contexts at roughly 16 per process and evicts the
 * oldest once a new one is requested past that — and `terminal-view.tsx`'s
 * own `onContextLoss` handler used to degrade the evicted pane to the DOM
 * renderer permanently, because nothing ever re-added the addon. Twelve
 * leaves headroom below Chromium's own ceiling for whatever else in the
 * process holds a context (devtools, the GPU compositor) that this registry
 * has no visibility into and cannot ration.
 *
 * This replaces `card-terminal-mounts.ts`'s `MAX_CARD_TERMINALS`, which
 * rationed the exact same resource but scoped to Kanban cards only — the
 * main terminal panel's own open sessions and the FAB's loop tabs mounted
 * unconditionally and spent from the same Chromium ceiling untracked. Every
 * mount site now reports through `useXtermWebglSlot` instead, and going over
 * budget degrades a pane to the DOM renderer rather than refusing to mount it
 * at all.
 */
export const MAX_WEBGL_CONTEXTS = 12;

/** Which renderer a session is actually drawing with, for `Settings ▸ Terminal` to read out. */
export type XtermRenderer = 'webgl' | 'dom';

type Mount = {
  visible: boolean;
  /** `Date.now()` at the last time this mount became visible; `0` if it never has been. */
  lastVisibleAt: number;
};

type State = {
  mounts: Record<string, Mount>;
  renderers: Record<string, XtermRenderer>;
  mount: (key: string, visible: boolean) => void;
  setVisible: (key: string, visible: boolean) => void;
  unmount: (key: string) => void;
  setRenderer: (key: string, renderer: XtermRenderer) => void;
};

export const useXtermBudget = create<State>()((set) => ({
  mounts: {},
  renderers: {},
  mount: (key, visible) =>
    set((state) => ({
      mounts: { ...state.mounts, [key]: { visible, lastVisibleAt: visible ? Date.now() : 0 } },
    })),
  setVisible: (key, visible) =>
    set((state) => {
      const existing = state.mounts[key];
      if (!existing || existing.visible === visible) return state;
      return {
        mounts: {
          ...state.mounts,
          [key]: { visible, lastVisibleAt: visible ? Date.now() : existing.lastVisibleAt },
        },
      };
    }),
  unmount: (key) =>
    set((state) => {
      if (!(key in state.mounts) && !(key in state.renderers)) return state;
      const mounts = { ...state.mounts };
      const renderers = { ...state.renderers };
      delete mounts[key];
      delete renderers[key];
      return { mounts, renderers };
    }),
  setRenderer: (key, renderer) =>
    set((state) =>
      state.renderers[key] === renderer
        ? state
        : { renderers: { ...state.renderers, [key]: renderer } },
    ),
}));

/**
 * Pure so the eviction rule has a direct unit test: every visible mount
 * outranks every hidden one, and among mounts on the same side of that split
 * the most-recently-visible wins — which is what makes the *least*-recently-
 * visible pane the one bumped once the budget is full. A mount that has
 * never been visible sorts last within the hidden group (`lastVisibleAt: 0`).
 */
export function grantedWebglKeys(
  mounts: Record<string, Mount>,
  limit: number = MAX_WEBGL_CONTEXTS,
): Set<string> {
  const ordered = Object.entries(mounts).sort(([, a], [, b]) => {
    if (a.visible !== b.visible) return a.visible ? -1 : 1;
    return b.lastVisibleAt - a.lastVisibleAt;
  });
  return new Set(ordered.slice(0, limit).map(([key]) => key));
}

/**
 * Reports one mounted xterm to the process-wide registry and returns whether
 * it currently holds a WebGL slot.
 *
 * `key` is the session id — stable for the lifetime of one mounted xterm, and
 * the same value regardless of which surface (panel, card, FAB tab) mounted
 * it, so the registry ration one number across every surface rather than one
 * per surface. `visible` is each surface's own idea of "the user can see this
 * one right now" (`active` for the panel and a FAB tab, `visible` for a
 * card) — the signal the eviction order above ranks on.
 */
export function useXtermWebglSlot(key: string, visible: boolean): boolean {
  const mount = useXtermBudget((s) => s.mount);
  const setVisible = useXtermBudget((s) => s.setVisible);
  const unmount = useXtermBudget((s) => s.unmount);
  const mounts = useXtermBudget((s) => s.mounts);

  useEffect(() => {
    mount(key, visible);
    return () => unmount(key);
    // `key` alone: a session id never changes for a mounted xterm's lifetime,
    // and `visible`'s own transitions are reported by the effect below rather
    // than by tearing this one down and re-running it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    setVisible(key, visible);
  }, [key, visible, setVisible]);

  return grantedWebglKeys(mounts).has(key);
}
