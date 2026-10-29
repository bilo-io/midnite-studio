// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { FabLoopHalo as FeatureFabLoopHalo } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const FabLoopHalo = withStudioLoopsHost(FeatureFabLoopHalo);

export {
  fabGlowClass,
  useAnyLoopRunning,
  type LoopsRunning,
} from '@midnite/studio-feature-loops/renderer';
