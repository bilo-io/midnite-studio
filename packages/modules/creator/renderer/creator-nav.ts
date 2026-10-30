import type { NavGroup } from '@midnite/studio-frame';
import { PiPaletteFill } from 'react-icons/pi';

import { creatorManifest } from '../manifest';
import { CREATOR_TABS } from './creator-tabs';

/**
 * Creator's nav group in a host's rail (Phase 124 Theme E.3): its media tabs (Docs, Images, Video, Audio) as
 * rows. A host composes it with `navFromModules`; the module's accent shows on the group label only.
 */
export const CREATOR_NAV_GROUP: NavGroup = {
  id: 'creator',
  label: creatorManifest.label,
  icon: PiPaletteFill,
  accent: creatorManifest.accent,
  views: CREATOR_TABS.map(({ id, label, icon }) => ({ id, label, icon })),
};
