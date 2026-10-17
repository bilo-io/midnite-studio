import { lazy, Suspense, useCallback } from 'react';

import type {
  DatabaseHost,
  DatabasePaneKey,
  DatabaseQueryEditorProps,
} from '@midnite/studio-feature-database/renderer';

import { Tooltip } from '../components/tooltip';
import { TreeSection } from '../components/tree-section';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the Database feature's host port (Phase 113 Theme O).
 *
 * Every member is the component or hook the Database view imported directly before it moved into
 * the package, so it looks and behaves exactly as it did. Nothing it stores moved: the connections
 * list's width stays in `ui-store`'s `layout` — the same persisted key.
 */

function usePaneSize(key: DatabasePaneKey) {
  const size = useUiStore((s) => s.layout[key]);
  const setLayout = useUiStore((s) => s.setLayout);
  const setSize = useCallback((value: number) => setLayout(key, value), [setLayout, key]);
  return { size, setSize, initial: DEFAULT_LAYOUT[key], ...LAYOUT_BOUNDS[key] };
}

/**
 * Monaco, in its own chunk — lazy, like `file-preview.tsx`'s own `CodeEditor`: the editor module
 * pulls in `monaco-editor` at module scope (`void getMonaco()`), which jsdom cannot evaluate cleanly
 * (`document.queryCommandSupported` does not exist there) and which must not ride the entry chunk
 * that `StudioProviders` is part of. The view mounts one per active query tab, and shows nothing
 * until the chunk lands — the `loading={null}` it always passed `<Editor>`.
 */
const LazyQueryEditor = lazy(() =>
  import('./database/database-query-editor').then((m) => ({ default: m.DatabaseQueryEditor })),
);

function StudioQueryEditor(props: DatabaseQueryEditorProps) {
  return (
    <Suspense fallback={null}>
      <LazyQueryEditor {...props} />
    </Suspense>
  );
}

export const STUDIO_DATABASE_HOST = {
  usePaneSize,
  Tooltip,
  TreeSection,
  QueryEditor: StudioQueryEditor,
} satisfies DatabaseHost;
