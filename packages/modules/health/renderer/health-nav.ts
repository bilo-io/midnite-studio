import type { NavGroup } from '@midnite/studio-frame';
import { LuDumbbell, LuLayoutDashboard, LuScale, LuTrendingUp, LuUtensils } from 'react-icons/lu';
import { PiHeartbeatFill } from 'react-icons/pi';

import { healthManifest } from '../manifest';

/**
 * Health's nav group in a host's rail (Phase 128 Theme A.3): Today, Biometrics, Nutrition, Workouts and
 * Progress. Settings is never listed — `AppShell` puts it at the rail's foot.
 */
export const HEALTH_NAV_GROUP: NavGroup = {
  id: 'health',
  label: healthManifest.label,
  icon: PiHeartbeatFill,
  accent: healthManifest.accent,
  views: [
    { id: 'today', label: 'Today', icon: LuLayoutDashboard },
    { id: 'biometrics', label: 'Biometrics', icon: LuScale },
    { id: 'nutrition', label: 'Nutrition', icon: LuUtensils },
    { id: 'workouts', label: 'Workouts', icon: LuDumbbell },
    { id: 'progress', label: 'Progress', icon: LuTrendingUp },
  ],
};
