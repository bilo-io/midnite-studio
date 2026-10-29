// Moved to @midnite/studio-feature-terminal (Phase 123 Theme E); re-exported so no import path moves.
// The component is bound to Studio's TerminalHost here, so every existing render site keeps working.
import { ReattachedNote as FeatureReattachedNote } from '@midnite/studio-feature-terminal/renderer';

import { withStudioTerminalHost } from '../../compose/terminal-host';

export const ReattachedNote = withStudioTerminalHost(FeatureReattachedNote);

export { noteText } from '@midnite/studio-feature-terminal/renderer';
