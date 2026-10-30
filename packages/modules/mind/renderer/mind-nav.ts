import type { NavGroup } from '@midnite/studio-frame';
import { LuNetwork, LuNotebookPen } from 'react-icons/lu';
import { PiBrainFill } from 'react-icons/pi';

import { mindManifest } from '../manifest';

/**
 * Mind's nav group in a host's rail (Phase 124 Theme E.3): Notes and Knowledge, in the app's tab order.
 * Settings is never listed — `AppShell` puts it at the rail's foot. A host composes the group with
 * `navFromModules`; the module's accent shows on the group label only.
 */
export const MIND_NAV_GROUP: NavGroup = {
  id: 'mind',
  label: mindManifest.label,
  icon: PiBrainFill,
  accent: mindManifest.accent,
  views: [
    { id: 'notes', label: 'Notes', icon: LuNotebookPen },
    { id: 'knowledge', label: 'Knowledge', icon: LuNetwork },
  ],
};
