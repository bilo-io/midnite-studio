import { LuFolderTree } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const explorerChord = chordFor('view.files', 'Mod+Shift+e');

/**
 * Go to Explorer — switches the workspace to the `files` view.
 *
 * See [`StatusToggle`](./status-toggle.tsx) for the shared behaviour. Not to
 * be confused with [`FilesToggle`](./files-toggle.tsx), which opens the
 * palette's fuzzy file finder rather than switching views.
 */
export function ExplorerToggle() {
  const active = useUiStore((s) => s.activeView === 'files');

  return (
    <StatusToggle
      testId="explorer-toggle"
      icon={LuFolderTree}
      name="Explorer"
      chord={displayChord(explorerChord)}
      active={active}
      onToggle={() => useUiStore.getState().setActiveView('files')}
      ariaLabel="Go to Explorer"
      tooltip={`Go to Explorer (${displayChord(explorerChord)})`}
    />
  );
}
