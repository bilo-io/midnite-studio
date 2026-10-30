// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { QuickAccessMenu as FeatureQuickAccessMenu } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const QuickAccessMenu = withStudioLoopsHost(FeatureQuickAccessMenu);

export { anchoredMenuPosition } from '@midnite/studio-feature-loops/renderer';
