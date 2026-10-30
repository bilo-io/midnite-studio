// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { LoopTab as FeatureLoopTab } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const LoopTab = withStudioLoopsHost(FeatureLoopTab);

