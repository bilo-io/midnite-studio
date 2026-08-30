import type { TestSuite } from '@midnite/studio-shared';

import { useTerminalStore } from '../terminal/terminal-store';
import { useUiStore } from '../../store/ui-store';

/**
 * Open the terminal on a fresh shell in the suite's own directory, with its
 * command typed at the prompt and NOT run — the `start-claude.ts` posture,
 * and the reason this needs no trust grant at all: it is the user's own shell,
 * running whatever they choose to press Return on, exactly as if they had
 * typed it themselves.
 */
export function runSuiteInTerminal(repoId: string, suite: TestSuite): void {
  useUiStore.getState().setTerminalOpen(true);

  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title: `${suite.packageName} · ${suite.name}`,
    cwd: suite.run.cwd,
    repoId,
  });

  useTerminalStore
    .getState()
    .queueInput(session.id, [suite.run.command, ...suite.run.args.map(shellQuote)].join(' '));
}

/** One shell word, whatever is in it — the same quoting `start-claude.ts` uses. */
function shellQuote(text: string): string {
  return /^[A-Za-z0-9_.:@/-]+$/.test(text) ? text : `'${text.replace(/'/g, String.raw`'\''`)}'`;
}
