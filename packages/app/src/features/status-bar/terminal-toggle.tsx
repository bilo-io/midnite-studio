import { SquareTerminal } from 'lucide-react';

import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const terminalChord = chordFor('terminal.toggle', 'Ctrl+`');

export function TerminalToggle() {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);

  return (
    <button
      type="button"
      onClick={toggleTerminal}
      title={`Toggle terminal (${displayChord(terminalChord)})`}
      aria-label="Toggle Terminal"
      aria-pressed={terminalOpen}
      className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
        terminalOpen ? 'bg-accent text-foreground' : ''
      }`}
    >
      <SquareTerminal aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
      <span className="status-label">Terminal</span>
      <span className="status-label ml-1.5 opacity-60">{displayChord(terminalChord)}</span>
    </button>
  );
}
