import { GoRepo } from 'react-icons/go';

import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const reposChord = chordFor('repos.toggle', 'Mod+g');

/**
 * `GoRepo` is Octicons, the same glyph the repositories panel's own header
 * wears, so the button and the thing it summons are recognisably one object.
 * This file is otherwise lucide, which has no repository mark that is not a
 * folder — and every folder variant in this app already means "worktree".
 */
export function ReposToggle() {
  const reposOpen = useUiStore((s) => s.reposOpen);
  const toggleRepos = useUiStore((s) => s.toggleRepos);

  return (
    <button
      type="button"
      onClick={toggleRepos}
      title={`Toggle repositories (${displayChord(reposChord)})`}
      aria-label="Toggle Repositories"
      aria-pressed={reposOpen}
      className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
        reposOpen ? 'bg-accent text-foreground' : ''
      }`}
    >
      <GoRepo aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
      <span className="status-label">Repos</span>
      <span className="status-label ml-1.5 opacity-60">{displayChord(reposChord)}</span>
    </button>
  );
}
