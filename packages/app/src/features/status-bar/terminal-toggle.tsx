import { LuSquareTerminal } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const terminalChord = chordFor('terminal.toggle', 'Ctrl+`');

/** See [`StatusToggle`](./status-toggle.tsx) for the shared behaviour. */
export function TerminalToggle() {
  const terminalOpen = useUiStore((s) => s.terminalOpen);
  const toggleTerminal = useUiStore((s) => s.toggleTerminal);

  return (
    <StatusToggle
      testId="terminal-toggle"
      icon={LuSquareTerminal}
      name="Terminal"
      chord={displayChord(terminalChord)}
      active={terminalOpen}
      onToggle={toggleTerminal}
      ariaLabel="Toggle Terminal"
      tooltip={`Toggle terminal (${displayChord(terminalChord)})`}
    />
  );
}
