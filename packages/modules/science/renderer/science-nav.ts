import type { NavGroup } from '@midnite/studio-frame';
import { LuLayoutTemplate, LuNotebookText } from 'react-icons/lu';
import { PiFlaskFill } from 'react-icons/pi';

import { scienceManifest } from '../manifest';

/**
 * Science's nav group in a host's rail (Phase 126 Theme A.2): Notebooks and Templates. Settings is never
 * listed — `AppShell` puts it at the rail's foot.
 */
export const SCIENCE_NAV_GROUP: NavGroup = {
  id: 'science',
  label: scienceManifest.label,
  icon: PiFlaskFill,
  accent: scienceManifest.accent,
  views: [
    { id: 'notebooks', label: 'Notebooks', icon: LuNotebookText },
    { id: 'templates', label: 'Templates', icon: LuLayoutTemplate },
  ],
};
