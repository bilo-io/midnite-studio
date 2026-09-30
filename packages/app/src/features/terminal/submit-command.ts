import { useUiStore } from '../../store/ui-store';
import { useTerminalStore } from './terminal-store';

/**
 * Spawns a shell session in the integrated terminal, opens the panel, and
 * submits `command` with a trailing carriage return — the one "run this in a
 * pty" primitive every button that hands the user a real command reuses
 * (Health's Install/Update, the agent cards, Ollama, the Models view's
 * daemon-down state, the Projects view's Reload).
 *
 * Previously lived in `settings-pages/health-page.tsx` beside an identical
 * private copy in `agent-page.tsx`; extracted here once a third, non-settings
 * surface needed it, so a view does not import a settings page to run a
 * command.
 *
 * Returns the new session's id (`null` for an empty command) so a caller that
 * needs to know when the command finishes — the setup overlay's install
 * runner (Phase 98 Theme D) — can watch that one session.
 */
export function submitCommand(command: string, title = 'shell'): string | null {
  if (!command) return null;
  const ui = useUiStore.getState();
  ui.setTerminalOpen(true);
  const cwd = ui.selectedWorktreePath ?? '.';
  const repoId = ui.selectedRepoId ?? 'default';
  const session = useTerminalStore.getState().openSession({
    kind: 'shell',
    title,
    cwd,
    repoId,
  });
  const input = command.endsWith('\r') || command.endsWith('\n') ? command : `${command}\r`;
  useTerminalStore.getState().queueInput(session.id, input);
  return session.id;
}
