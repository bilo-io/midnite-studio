import { LuSquareTerminal } from 'react-icons/lu';

import { Tooltip } from '../../components/tooltip';
import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const terminalChord = chordFor('terminal.toggle', 'Ctrl+`');

/** `Tooltip` replaces the native `title` — see `ReposToggle`'s comment. */
export function TerminalToggle() {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);

  return (
    <Tooltip label={`Toggle terminal (${displayChord(terminalChord)})`} side="top">
      <button
        type="button"
        data-testid="terminal-toggle"
        onClick={toggleTerminal}
        aria-label="Toggle Terminal"
        aria-pressed={terminalOpen}
        className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
          terminalOpen ? 'bg-accent text-foreground' : ''
        }`}
      >
        <LuSquareTerminal aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        <span className="status-label">Terminal</span>
        <span className="status-label ml-1.5 opacity-60">{displayChord(terminalChord)}</span>
      </button>
    </Tooltip>
  );
}
