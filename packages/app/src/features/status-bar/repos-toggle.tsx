import { FaGitAlt } from 'react-icons/fa';

import { Tooltip } from '../../components/tooltip';
import { useUiStore } from '../../store/ui-store';
import { chordFor, displayChord } from './chord-hint';

const reposChord = chordFor('repos.toggle', 'Mod+g');

/**
 * `FaGitAlt` is the Git logo itself, in Git's own `#F05032` — the same pairing
 * `IconButton`'s `git` tone uses for the per-repo git menu, and the same glyph
 * the repositories panel's own header wears, so the button and the thing it
 * summons are recognisably one object. The colour is a literal rather than a
 * theme token for the reason that tone gives: it identifies *git*, not this
 * app, so it must not move when the user picks an accent.
 *
 * `Tooltip` replaces the native `title` (Theme G): at `compact`/`collapsed`
 * density `.status-label` hides the inline "Git Repos ⌘G" text, leaving a bare
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
        <FaGitAlt aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-[#F05032]" />
        <span className="status-label">Git Repos</span>
        <span className="status-label ml-1.5 opacity-80">
          ⌘<span className="text-[13px] font-bold">G</span>
        </span>
      </button>
    </Tooltip>
  );
}
