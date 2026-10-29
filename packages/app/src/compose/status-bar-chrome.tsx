import type { StatusBarChrome } from '@midnite/studio-frame';

import { Popover } from '../components/popover';
import { Tooltip } from '../components/tooltip';

/**
 * Studio's chrome for the frame's status bar (Phase 123 Theme J). The popover
 * portals into `document.body`, which is what lets a collapsed segment's label
 * show again inside the overflow panel.
 */
export const STUDIO_STATUS_BAR_CHROME = { Tooltip, Popover } satisfies StatusBarChrome;
