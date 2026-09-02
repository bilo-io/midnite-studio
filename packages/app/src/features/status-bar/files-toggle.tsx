import { LuFile } from 'react-icons/lu';

import { usePaletteStore } from '../../store/palette-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const filesChord = chordFor('palette.files', 'Mod+p');

/** Go to File — the palette's `files` mode. See [`PaletteToggle`](./palette-toggle.tsx). */
export function FilesToggle() {
  const isOpen = usePaletteStore((s) => s.isOpen);
  const mode = usePaletteStore((s) => s.mode);
  const active = isOpen && mode === 'files';

  return (
    <StatusToggle
      testId="files-toggle"
      icon={LuFile}
      name="Go to File"
      chord={displayChord(filesChord)}
      active={active}
      onToggle={() => {
        const palette = usePaletteStore.getState();
        if (active) palette.close();
        else palette.open('files');
      }}
      ariaLabel="Go to File"
      tooltip={`Go to file (${displayChord(filesChord)})`}
    />
  );
}
