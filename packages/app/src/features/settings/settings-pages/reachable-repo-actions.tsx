import { LuExternalLink, LuX } from 'react-icons/lu';

import type { ForgeAccount, ReachableRepo } from '@midnite/studio-shared';

import { IconButton } from '../../../components/icon-button';
import { openLinkFromEvent } from '../../../services/open-in-midnite';
import { useUiStore } from '../../../store/ui-store';
import { useTerminalStore } from '../../terminal/terminal-store';
import { reachableRepoDeleteCommand, reachableRepoWebUrl } from './reachable-repo-commands';

/**
 * The trailing action cluster on a Reachable repositories row: open the repo's
 * forge page, and stage its delete command in a terminal.
 *
 * Delete never deletes. It opens a fresh shell with the provider CLI's delete
 * command typed at the prompt and no Return pressed — the `runSuiteInTerminal`
 * posture — so the user reads exactly what will run, presses Return
 * themselves, and then still answers the CLI's own confirmation.
 */
export function ReachableRepoActions({ account, repo }: { account: ForgeAccount; repo: ReachableRepo }) {
  const del = reachableRepoDeleteCommand(account, repo);
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton
        icon={LuExternalLink}
        size="sm"
        tooltipSide="top"
        label={`Open ${repo.fullName} in the browser`}
        onClick={(event) => openLinkFromEvent(reachableRepoWebUrl(account, repo), event)}
      />
      <IconButton
        icon={LuX}
        size="sm"
        tone="danger"
        tooltipSide="top"
        // The "typed into a terminal" note only describes a command that exists;
        // a disabled button's tooltip is the label plus its reason instead.
        label={del.ok ? `Delete ${repo.fullName}… (typed into a terminal, not run)` : `Delete ${repo.fullName}`}
        disabled={!del.ok}
        {...(del.ok ? {} : { disabledReason: del.reason })}
        onClick={() => {
          if (del.ok) stageInTerminal(del.command, `delete ${repo.name}`);
        }}
      />
    </div>
  );
}

/** Open the terminal on a fresh shell with `command` typed and NOT executed. */
function stageInTerminal(command: string, title: string): void {
  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title,
    cwd: ui.selectedWorktreePath ?? '.',
    repoId: ui.selectedRepoId ?? 'default',
  });
  useTerminalStore.getState().queueInput(session.id, command);
}
