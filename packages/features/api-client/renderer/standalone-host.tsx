import { useCallback } from 'react';
import { useStore } from 'zustand';

import { createPersistedStore, KitPopover, KitTreeSection, useEscapeDismiss } from '@midnite/studio-frame';

import type { ApiClientCodeFieldProps, ApiClientHost, ApiClientPaneKey } from './host';

/**
 * A complete {@link ApiClientHost} for an app that is not Studio (Phase 113 Theme O) — media-core's
 * `createStandaloneMediaHost`, for the API client. The app hands over only what it alone knows:
 * which repository is selected. Everything else is plain chrome over the frame's kit, a textarea
 * for the code fields, and pane sizes and per-repository environment choices in this window's
 * localStorage under `storageKey`.
 */
export type StandaloneApiClientHostOptions = {
  useActiveRepo: ApiClientHost['useActiveRepo'];
  /** localStorage key prefix for pane sizes and the active environments. */
  storageKey?: string;
};

/** Studio's defaults and bounds (`ui-store`'s `DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`). */
const PANES: Record<ApiClientPaneKey, { initial: number; min: number; max: number }> = {
  apiTreeWidth: { initial: 320, min: 200, max: 640 },
  apiBuilderHeight: { initial: 260, min: 140, max: 640 },
};

type Persisted = { sizes: Partial<Record<ApiClientPaneKey, number>>; activeEnvironmentByRepo: Record<string, string | null> };
type State = Persisted & {
  setSize: (key: ApiClientPaneKey, value: number) => void;
  selectEnvironment: (repoId: string, environmentId: string | null) => void;
};

/**
 * The plain code field: a monospace textarea driven by the same `value`/`onChange` Monaco is. No
 * language service, so `ambientLib` is ignored, and nothing is handed to `onEditorMount` — the Body
 * tab's Beautify button, which needs an editor action, simply does not appear.
 */
export function PlainCodeField({ value, onChange, language, height, readOnly = false }: ApiClientCodeFieldProps) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" style={height === undefined ? undefined : { height }}>
      <textarea
        data-testid="code-field"
        data-language={language}
        aria-label={readOnly ? 'Read-only content' : 'Code'}
        spellCheck={false}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full resize-none bg-background p-2 font-mono text-xs leading-5 text-foreground outline-none"
      />
    </div>
  );
}

export function createStandaloneApiClientHost(options: StandaloneApiClientHostOptions): ApiClientHost {
  const store = createPersistedStore<State, Persisted>({
    key: `${options.storageKey ?? 'midnite-api-client'}.ui`,
    defaults: { sizes: {}, activeEnvironmentByRepo: {} },
    pick: ({ sizes, activeEnvironmentByRepo }) => ({ sizes, activeEnvironmentByRepo }),
    state: (set, initial) => ({
      ...initial,
      setSize: (key, value) => set((state) => ({ sizes: { ...state.sizes, [key]: value } })),
      selectEnvironment: (repoId, environmentId) =>
        set((state) => ({ activeEnvironmentByRepo: { ...state.activeEnvironmentByRepo, [repoId]: environmentId } })),
    }),
  });

  return {
    useActiveRepo: options.useActiveRepo,
    usePaneSize: (key) => {
      const size = useStore(store, (s) => s.sizes[key]) ?? PANES[key].initial;
      const set = useStore(store, (s) => s.setSize);
      const setSize = useCallback((value: number) => set(key, value), [set, key]);
      return { size, setSize, ...PANES[key] };
    },
    useActiveEnvironment: (repoId) => {
      const environmentId = useStore(store, (s) => (repoId === null ? null : (s.activeEnvironmentByRepo[repoId] ?? null)));
      const select = useStore(store, (s) => s.selectEnvironment);
      return { environmentId, select };
    },
    getActiveEnvironmentId: (repoId) => store.getState().activeEnvironmentByRepo[repoId] ?? null,
    useDismiss: useEscapeDismiss,
    Popover: KitPopover,
    TreeSection: KitTreeSection,
    CodeField: PlainCodeField,
  };
}
