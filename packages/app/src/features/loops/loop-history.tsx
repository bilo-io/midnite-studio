// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { LoopHistory as FeatureLoopHistory } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const LoopHistory = withStudioLoopsHost(FeatureLoopHistory);

