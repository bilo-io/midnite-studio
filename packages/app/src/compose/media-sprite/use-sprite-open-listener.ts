import { bridge } from '@midnite/studio-frame';
import { useSpriteOpenRequest } from '@midnite/studio-feature-media-sprite/renderer';
import { useEffect } from 'react';

import { useUiStore } from '../../store/ui-store';

/**
 * Studio's half of `sprite_open` (Phase 106 Theme K): an agent asks the window to show an asset, and it is
 * this listener — mounted once by the app shell, main window only, because the Sprites tab may not be
 * mounted when the agent calls — that selects the repository, posts the request to the feature's store
 * and brings the tab up.
 */
export function useSpriteOpenListener(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return;
    const off = bridge()?.media.sprite.onOpen((event) => {
      const ui = useUiStore.getState();
      if (ui.selectedRepoId !== event.repoId) ui.selectRepo(event.repoId);
      useSpriteOpenRequest.getState().open(event);
      ui.openMedia('sprite');
    });
    return () => off?.();
  }, []);
}
