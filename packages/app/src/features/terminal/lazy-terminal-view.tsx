// Moved to @midnite/studio-feature-terminal (Phase 123 Theme E); re-exported so no import path moves.
// The components are bound to Studio's TerminalHost here, so every existing render site keeps working.
import { LazyTerminalView as FeatureLazyTerminalView } from '@midnite/studio-feature-terminal/renderer';

import { withStudioTerminalHost } from '../../compose/terminal-host';

export const LazyTerminalView = withStudioTerminalHost(FeatureLazyTerminalView);

export {
  loadTerminalView,
  type LazyTerminalViewProps,
} from '@midnite/studio-feature-terminal/renderer';
