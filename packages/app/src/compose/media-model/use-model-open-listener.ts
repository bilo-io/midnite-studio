import { useModelOpenRequest } from '@midnite/studio-feature-media-model/events';
import { bridge } from '@midnite/studio-frame';
import { useEffect } from 'react';

import { useUiStore } from '../../store/ui-store';

/**
 * Studio's half of `model_open` (Phase 99 Theme G): an agent asks the window to show a model, and it is this
 * listener — mounted once by the app shell, main window only, because the Models tab may not be mounted when
 * the agent calls — that selects the repository, posts the request to the feature's store and brings the
 * tab up.
 */
export function useModelOpenListener(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.model.onOpen((event) => {
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
      useModelOpenRequest.getState().open(event);
      ui.openMedia('model');
    });
    return () => off?.();
  }, []);
}
