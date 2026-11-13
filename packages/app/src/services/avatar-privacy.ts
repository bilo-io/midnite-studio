import { privacySwitchOn } from '@midnite/studio-shared';

import { useUiStore } from '../store/ui-store';
import { setRemoteAvatarsEnabled } from './avatars';

/**
 * Phase 115 Theme A: mirrors the `avatars` privacy switch and the master into the frame's avatar cache, before
 * the first row renders (the persisted store hydrates synchronously) and on every later change. Imported for its
 * side effect by `app.tsx`.
 */
const mirror = (s: { egressAllAutomaticOff: boolean; egressSwitches: Record<string, boolean> }): void =>
  setRemoteAvatarsEnabled(privacySwitchOn({ allAutomaticOff: s.egressAllAutomaticOff, switches: s.egressSwitches }, 'avatars'));

mirror(useUiStore.getState());
useUiStore.subscribe(mirror);
