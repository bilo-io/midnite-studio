import { lazy, Suspense, useCallback } from 'react';

import type {
  ApiClientCodeFieldProps,
  ApiClientHost,
  ApiClientPaneKey,
} from '@midnite/studio-feature-api-client/renderer';

import { Popover } from '../components/popover';
import { TreeSection } from '../components/tree-section';
import { useDismiss } from '../components/use-dismiss';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the API client feature's host port (Phase 113 Theme O).
 *
 * Every member is the component, hook or function the API Client imported
 * directly before it moved into the package, so the view looks and behaves
 * exactly as it did. Nothing it stores moved: the two pane sizes stay in
 * `ui-store`'s `layout`, the active environment of each repository in
 * `activeEnvironmentByRepo` — the same persisted keys.
 */

function usePaneSize(key: ApiClientPaneKey) {
  const size = useUiStore((s) => s.layout[key]);
  const setLayout = useUiStore((s) => s.setLayout);
  const setSize = useCallback((value: number) => setLayout(key, value), [setLayout, key]);
  return { size, setSize, initial: DEFAULT_LAYOUT[key], ...LAYOUT_BOUNDS[key] };
}

/**
 * Monaco, in its own chunk. The field used to ride the API Client's lazy view chunk; a static import
 * here would hoist the editor (and its five workers) into the entry chunk through `StudioProviders`,
 * so the real field is loaded the first time one mounts and shows nothing until then — the
 * `loading={null}` it always passed `<Editor>`.
 */
const LazyCodeField = lazy(() => import('./api-client/api-client-code-field').then((m) => ({ default: m.ApiClientCodeField })));

function StudioCodeField(props: ApiClientCodeFieldProps) {
  return (
    <Suspense fallback={null}>
      <LazyCodeField {...props} />
    </Suspense>
  );
}

export const STUDIO_API_CLIENT_HOST = {
  useActiveRepo: () => ({ repoId: useUiStore((s) => s.selectedRepoId) }),
  usePaneSize,
  useActiveEnvironment: (repoId) => {
    const environmentId = useUiStore((s) => (repoId === null ? null : (s.activeEnvironmentByRepo[repoId] ?? null)));
    const select = useUiStore((s) => s.setActiveEnvironment);
    return { environmentId, select };
  },
  getActiveEnvironmentId: (repoId) => useUiStore.getState().activeEnvironmentByRepo[repoId] ?? null,
  useDismiss: (open, onDismiss) => useDismiss(open, onDismiss, { layer: 'dialog' }),
  Popover,
  TreeSection,
  CodeField: StudioCodeField,
} satisfies ApiClientHost;
