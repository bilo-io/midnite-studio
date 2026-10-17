import type { TestsHost } from '@midnite/studio-feature-tests/renderer';

import { useActiveWorktree } from '../services/use-status';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';
import { runSuiteInTerminal } from './tests/run-in-terminal';

/**
 * Studio's side of the tests feature's host port (Phase 113 Theme O): the
 * sidebar's selection, the list width in `ui-store`'s `layout.testsListWidth`,
 * and "Run in terminal" through Studio's terminal panel — nothing stored moved.
 */
export const STUDIO_TESTS_HOST = {
  useActiveRepo: useActiveWorktree,
  useListWidth: () => {
    const size = useUiStore((s) => s.layout.testsListWidth);
    const setLayout = useUiStore((s) => s.setLayout);
    return {
      size,
      setSize: (value: number) => setLayout('testsListWidth', value),
      initial: DEFAULT_LAYOUT.testsListWidth,
      ...LAYOUT_BOUNDS.testsListWidth,
    };
  },
  runInTerminal: runSuiteInTerminal,
} satisfies TestsHost;
