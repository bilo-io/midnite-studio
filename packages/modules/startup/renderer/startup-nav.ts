import type { NavGroup } from '@midnite/studio-frame';
import { LuGauge, LuHandshake, LuHourglass, LuMilestone, LuReceipt } from 'react-icons/lu';
import { PiBuildingsFill } from 'react-icons/pi';

import { startupManifest } from '../manifest';

/**
 * Startup's nav group in a host's rail: Overview, Roadmap, Runway, Invoices and Vendors. Settings is never
 * listed — `AppShell` puts it at the rail's foot. A host composes the group with `navFromModules`.
 */
export const STARTUP_NAV_GROUP: NavGroup = {
  id: 'startup',
  label: startupManifest.label,
  icon: PiBuildingsFill,
  accent: startupManifest.accent,
  views: [
    { id: 'startup.overview', label: 'Overview', icon: LuGauge },
    { id: 'startup.roadmap', label: 'Roadmap', icon: LuMilestone },
    { id: 'startup.runway', label: 'Runway', icon: LuHourglass },
    { id: 'startup.invoices', label: 'Invoices', icon: LuReceipt },
    { id: 'startup.vendors', label: 'Vendors', icon: LuHandshake },
  ],
};
