import type { ComponentType } from 'react';

import type { ApiClientManifest } from '../manifest';

/**
 * The API client feature's renderer half (Phase 113 Theme O): the API Client view — collection tree,
 * request builder, response viewer, environments, history and the collection runner — and its store.
 * Needs the frame (bridge, chrome port, resizable panes) and its own {@link ApiClientHost}.
 */
export { apiClientManifest, type ApiClientManifest } from '../manifest';
export {
  ApiClientHostProvider,
  useApiClientHost,
  type ApiClientCodeFieldProps,
  type ApiClientEditorHandle,
  type ApiClientHost,
  type ApiClientPaneKey,
  type ApiClientPaneSize,
  type ApiClientPopoverProps,
  type ApiClientTreeSectionProps,
} from './host';
export { createStandaloneApiClientHost, PlainCodeField, type StandaloneApiClientHostOptions } from './standalone-host';
// The store the app reads around the view: tabs closed with their repository, the companion's reveal.
export { apiTabId, configureApiClientStore, isTabDirty, useApiClientStore, type ApiTab, type ApiTabRef } from './api-client-store';

type ViewIds = ApiClientManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const apiClientViews = {
  apiClient: () => import('./api-client-view').then((m) => m.ApiClientView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
