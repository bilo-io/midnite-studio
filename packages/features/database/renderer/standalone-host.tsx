import { cloneElement, useCallback, type KeyboardEvent } from 'react';
import { useStore } from 'zustand';

import { createPersistedStore, KitTreeSection } from '@midnite/studio-frame';

import type { DatabaseHost, DatabasePaneKey, DatabaseQueryEditorProps, DatabaseTooltipProps } from './host';

/**
 * A complete {@link DatabaseHost} for an app that is not Studio (Phase 113 Theme O) —
 * media-core's `createStandaloneMediaHost`, for the Database tool. It needs nothing from the app:
 * plain chrome over the frame's kit, a textarea for the SQL editor and the connections list's
 * width in this window's localStorage under `storageKey`.
 */
export type StandaloneDatabaseHostOptions = {
  /** localStorage key prefix for the pane size. */
  storageKey?: string;
};

/** Studio's defaults and bounds (`ui-store`'s `DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`). */
const PANES: Record<DatabasePaneKey, { initial: number; min: number; max: number }> = {
  databaseConnectionsWidth: { initial: 288, min: 220, max: 480 },
};

type Persisted = { sizes: Partial<Record<DatabasePaneKey, number>> };
type State = Persisted & { setSize: (key: DatabasePaneKey, value: number) => void };

/** A native `title` is the tooltip — no overlay, no occluder stack. */
export function PlainTooltip({ label, children }: DatabaseTooltipProps) {
  return typeof label === 'string' ? cloneElement(children, { title: label }) : children;
}

/**
 * The plain SQL editor: a monospace textarea driven by the same `sql`/`onChange` Monaco is, with
 * `Mod+Enter` running the statement exactly as the editor's own chord does. No highlighting.
 */
export function PlainQueryEditor({ sql, onChange, onRunChord }: DatabaseQueryEditorProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onRunChord();
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-hidden" data-testid="query-editor">
      <textarea
        aria-label="SQL"
        spellCheck={false}
        value={sql}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="h-full w-full resize-none bg-background p-2 font-mono text-xs leading-5 text-foreground outline-none"
      />
    </div>
  );
}

export function createStandaloneDatabaseHost(options: StandaloneDatabaseHostOptions = {}): DatabaseHost {
  const store = createPersistedStore<State, Persisted>({
    key: `${options.storageKey ?? 'midnite-database'}.ui`,
    defaults: { sizes: {} },
    pick: ({ sizes }) => ({ sizes }),
    state: (set, initial) => ({
      ...initial,
      setSize: (key, value) => set((state) => ({ sizes: { ...state.sizes, [key]: value } })),
    }),
  });

  return {
    usePaneSize: (key) => {
      const size = useStore(store, (s) => s.sizes[key]) ?? PANES[key].initial;
      const set = useStore(store, (s) => s.setSize);
      const setSize = useCallback((value: number) => set(key, value), [set, key]);
      return { size, setSize, ...PANES[key] };
    },
    Tooltip: PlainTooltip,
    TreeSection: KitTreeSection,
    QueryEditor: PlainQueryEditor,
  };
}
