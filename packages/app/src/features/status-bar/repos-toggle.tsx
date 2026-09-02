import { FaGitAlt } from 'react-icons/fa';

import { useUiStore } from '../../store/ui-store';

import { chordFor, displayChord } from './chord-hint';
import { StatusToggle } from './status-toggle';

const reposChord = chordFor('repos.toggle', 'Mod+g');

/**
 * `FaGitAlt` is the Git logo itself, in Git's own `#F05032` — the same pairing
 * `IconButton`'s `git` tone uses for the per-repo git menu, and the same glyph
 * the repositories panel's own header wears, so the button and the thing it
 * summons are recognisably one object. The colour is a literal rather than a
 * theme token for the reason that tone gives: it identifies *git*, not this
 * app, so it must not move when the user picks an accent.
 *
 * Everything else — the `Tooltip` that replaced the native `title`, the
 * `aria-pressed`, the name-while-active-or-hovered rule, the chord hint — lives
 * in [`StatusToggle`](./status-toggle.tsx) now. This file is the store
 * selector, the glyph and the chord, and nothing else.
 */
export function ReposToggle() {
  const reposOpen = useUiStore((s) => s.reposOpen);
  const toggleRepos = useUiStore((s) => s.toggleRepos);

  return (
    <StatusToggle
      testId="repos-toggle"
      icon={FaGitAlt}
      iconClassName="text-[#F05032]"
      name="Git Repos"
      chord={displayChord(reposChord)}
      active={reposOpen}
      onToggle={toggleRepos}
      ariaLabel="Toggle Repositories"
      tooltip={`Toggle repositories (${displayChord(reposChord)})`}
    />
  );
}
