import type { NavGroup } from '@midnite/studio-frame';
import { LuBird, LuGrid3X3, LuOrbit } from 'react-icons/lu';
import { PiPlanetFill } from 'react-icons/pi';

import { simulatorManifest } from '../manifest';

/**
 * Simulator's nav group in a host's rail (Phase 127 Theme A.2). View ids carry a `sim-` prefix so they can
 * never collide with another module's ids in a shared rail.
 */
export const SIMULATOR_NAV_GROUP: NavGroup = {
  id: 'simulator',
  label: simulatorManifest.label,
  icon: PiPlanetFill,
  accent: simulatorManifest.accent,
  views: [
    { id: 'sim-automata', label: 'Emergence', icon: LuGrid3X3 },
    { id: 'sim-worlds', label: 'Virtual worlds', icon: LuOrbit },
    { id: 'sim-agents', label: 'Agent environments', icon: LuBird },
  ],
};
