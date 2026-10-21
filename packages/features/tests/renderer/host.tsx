import { createContext, useContext, type ReactNode } from 'react';

import type { TestSuite } from '@midnite/studio-shared';

/**
 * The tests feature's host port (Phase 113 Theme O): the selected repository,
 * the list pane's persisted width and — optional, because only an app with a
 * terminal has it — opening a suite's command in a shell, typed and not run.
 */
export type TestsPaneSize = { size: number; setSize: (value: number) => void; initial: number; min: number; max: number };

export type TestsHost = {
  /** The repository (and checkout) the app has selected. A hook. */
  useActiveRepo: () => { repoId: string | null; worktreePath?: string };
  /** The suite list's persisted width. A hook. */
  useListWidth: () => TestsPaneSize;
  /** Open a shell on the suite's directory with its command typed at the prompt. Absent without a terminal. */
  runInTerminal?: (repoId: string, suite: TestSuite) => void;
};

const TestsHostContext = createContext<TestsHost | null>(null);

export function TestsHostProvider({ host, children }: { host: TestsHost; children: ReactNode }) {
  return <TestsHostContext.Provider value={host}>{children}</TestsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the Tests view would not render. */
export function useTestsHost(): TestsHost {
  const host = useContext(TestsHostContext);
  if (!host) throw new Error('The tests feature must be rendered inside <TestsHostProvider>');
  return host;
}
