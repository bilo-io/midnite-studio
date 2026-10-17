import { useFrameChrome } from '../chrome/chrome-port';
import type { IconButtonProps, IconComponent } from '../chrome/types';
import {
  useGitHost,
  type GitDismissOptions,
  type GitMultiSelectProps,
  type GitTooltipProps,
  type GitUserAvatarProps,
} from './git-host';
import type { GitUiState } from './graph-ui-state';

/**
 * The graph's and diff's chrome, read through their ports (Phase 113 Theme O).
 *
 * Each is a thin stand-in with the name and props the views always used, so a moved file swapped an
 * import line rather than its markup: `Tooltip`, `MultiSelectMenu` and `UserAvatar` are the composer's
 * own (the `GitHost` port), `IconButton` the frame chrome port's. Studio's are the components these
 * views rendered before the move, so its DOM is unchanged.
 */

/** A selector over the composer's UI store — what `useUiStore(selector)` was. */
export function useGitUi<T>(selector: (state: GitUiState) => T): T {
  return useGitHost().useUi(selector);
}

export function useGitDismiss(active: boolean, onDismiss: () => void, options?: GitDismissOptions): void {
  useGitHost().useDismiss(active, onDismiss, options);
}

export function useGitOccluder(active = true): void {
  useGitHost().useOccluder(active);
}

/** The composer's agent-mark resolver, for a component to call while it renders. */
export function useResolveAgentIcon(): (agent: { id: string; icon?: string }) => IconComponent {
  return useGitHost().resolveAgentIcon;
}

export function Tooltip(props: GitTooltipProps) {
  const { Tooltip: Composed } = useGitHost();
  return <Composed {...props} />;
}

export function MultiSelectMenu(props: GitMultiSelectProps) {
  const { MultiSelectMenu: Composed } = useGitHost();
  return <Composed {...props} />;
}

export function UserAvatar(props: GitUserAvatarProps) {
  const { UserAvatar: Composed } = useGitHost();
  return <Composed {...props} />;
}

export function IconButton(props: IconButtonProps) {
  const { IconButton: Composed } = useFrameChrome();
  return <Composed {...props} />;
}

export type { GitMultiSelectOption as MultiSelectOption } from './git-host';
