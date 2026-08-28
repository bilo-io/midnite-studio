import { GoGlobe } from 'react-icons/go';

import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const browserChord = chordFor('browser.toggle', 'Mod+b');

export function BrowserToggle() {
  const browserOpen = useUiStore((s) => s.browserOpen);
  const toggleBrowser = useUiStore((s) => s.toggleBrowser);

  return (
    <button
      type="button"
      data-testid="browser-toggle"
      onClick={toggleBrowser}
      title={`Toggle browser (${displayChord(browserChord)})`}
      aria-label="Toggle Browser"
      aria-pressed={browserOpen}
      className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
        browserOpen ? 'bg-accent text-foreground' : ''
      }`}
    >
      <GoGlobe aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
      <span className="status-label">Browser</span>
      <span className="status-label ml-1.5 opacity-60">{displayChord(browserChord)}</span>
    </button>
  );
}
