// Moved to @midnite/studio-feature-terminal (Phase 123 Theme E); re-exported so no import path moves.
// The components are bound to Studio's TerminalHost here, so every existing render site keeps working.
import { TerminalView as FeatureTerminalView } from '@midnite/studio-feature-terminal/renderer';

import { withStudioTerminalHost } from '../../compose/terminal-host';

export const TerminalView = withStudioTerminalHost(FeatureTerminalView);

