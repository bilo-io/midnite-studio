import type { NavGroup } from '@midnite/studio-frame';
import { PiCameraFill } from 'react-icons/pi';

import { captureManifest } from '../manifest';
import { CAPTURE_APP } from './capture-manifest';

/**
 * Capture's nav group in a host's rail (Phase 124 Theme E.3): its one view. A host composes it with
 * `navFromModules`; the module's accent shows on the group label only.
 */
export const CAPTURE_NAV_GROUP: NavGroup = {
  id: 'capture',
  label: captureManifest.label,
  icon: PiCameraFill,
  accent: captureManifest.accent,
  views: CAPTURE_APP.nav.views.map(({ id, label, icon }) => ({ id, label, icon })),
};
