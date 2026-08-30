import { GoRepo } from 'react-icons/go';

import { Tooltip } from '../../components/tooltip';
import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const reposChord = chordFor('repos.toggle', 'Mod+g');

/**
 * `GoRepo` is Octicons, the same glyph the repositories panel's own header
 * wears, so the button and the thing it summons are recognisably one object.
 * This file is otherwise lucide, which has no repository mark that is not a
 * folder — and every folder variant in this app already means "worktree".
 *
 * `Tooltip` replaces the native `title` (Theme G): at `compact`/`collapsed`
 * density `.status-label` hides the inline "Repos ⌘G" text, leaving a bare
 * icon with no visible name, and a native tooltip is the one thing this
 * codebase already replaced everywhere else (`icon-button.tsx`) for being
 * slow and unstyled. Unconditional rather than gated on density: the two
 * never conflict, since Tooltip only opens on hover/focus and stays silent
 * while the inline label is already doing the job.
 */
export function ReposToggle() {
  const reposOpen = useUiStore((s) => s.reposOpen);
  const toggleRepos = useUiStore((s) => s.toggleRepos);

  return (
    <Tooltip label={`Toggle repositories (${displayChord(reposChord)})`} side="top">
      <button
        type="button"
        data-testid="repos-toggle"
        onClick={toggleRepos}
        aria-label="Toggle Repositories"
        aria-pressed={reposOpen}
        className={`rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground ${
          reposOpen ? 'bg-accent text-foreground' : ''
        }`}
      >
        <GoRepo aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        <span className="status-label">Repos</span>
        <span className="status-label ml-1.5 opacity-80">
          ⌘<span className="text-[13px] font-bold">G</span>
        </span>
      </button>
    </Tooltip>
  );
}
