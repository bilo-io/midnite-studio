// Moved to @midnite/studio-feature-loops (Phase 123 Theme G); re-exported so no import path moves.
import { CustomLoopEditor as FeatureCustomLoopEditor, CustomLoopToolbar as FeatureCustomLoopToolbar } from '@midnite/studio-feature-loops/renderer';

import { withStudioLoopsHost } from '../../compose/loops-host';

export const CustomLoopEditor = withStudioLoopsHost(FeatureCustomLoopEditor);
export const CustomLoopToolbar = withStudioLoopsHost(FeatureCustomLoopToolbar);

