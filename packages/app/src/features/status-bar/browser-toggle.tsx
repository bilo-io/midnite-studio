import { MidniteIcon } from '../../components/icons/midnite-icon';
import { useUiStore } from '../../store/ui-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const browserChord = chordFor('browser.toggle', 'Mod+b');

/**
 * See [`StatusToggle`](./status-toggle.tsx) for the shared behaviour.
 *
 * The chord now goes through `displayChord` like every other button in the
 * rail. It used to be a hard-coded `⌘`+bold-`B` in JSX, which read wrongly on
 * every platform where `Mod` is `Ctrl`.
 */
export function BrowserToggle() {
  const browserOpen = useUiStore((s) => s.browserOpen);
  const toggleBrowser = useUiStore((s) => s.toggleBrowser);

  return (
    <StatusToggle
      testId="browser-toggle"
      icon={MidniteIcon}
      name="Browser"
      chord={displayChord(browserChord)}
      active={browserOpen}
      onToggle={toggleBrowser}
      ariaLabel="Toggle Browser"
      tooltip={`Toggle browser (${displayChord(browserChord)})`}
    />
  );
}
