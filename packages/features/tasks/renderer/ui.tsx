import { useMemo } from 'react';

import {
  TextArea,
  TextField,
  useFrameChrome,
  type ActivityGlowBadge,
  type FrameDialogs,
  type IconButtonProps,
} from '@midnite/studio-frame';
import type { ForgeIssue, PageWindowRole } from '@midnite/studio-shared';

import {
  useTasksHost,
  type TasksDismissableOptions,
  type TasksExternalLinkProps,
  type TasksForgeRefLinkProps,
  type TasksModalProps,
  type TasksMultiSelectMenuProps,
  type TasksToastApi,
  type TasksUiState,
  type TasksUserAvatarProps,
  type TasksWandFieldProps,
} from './host';

/**
 * The chrome Tasks draws, resolved through the installed ports on each render
 * (Phase 113 Theme O) — the forge and database features' `ui.tsx` pattern. The
 * views imported these straight from the app's `components/`; the wrappers keep
 * those call sites as they were while the implementation is whichever the
 * composing app installed.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

/** The dialog host's confirms, notices and context menus. */
export function useDialogs(): FrameDialogs {
  const dialogs = useFrameChrome().useDialogs();
  return useMemo(() => dialogs, [dialogs]);
}

/** The app's ui slice — Studio's `useUiStore`, or the composing app's own. A hook. */
export function useTasksUi<T>(selector: (state: TasksUiState) => T): T {
  return useTasksHost().useUi(selector);
}

/** The repository (and checkout) the app has selected. A hook. */
export function useActiveWorktree(): { repoId: string | null; worktreePath?: string } {
  return useTasksHost().useActiveRepo();
}

export function UserAvatar(props: TasksUserAvatarProps) {
  const { UserAvatar: Impl } = useTasksHost();
  return <Impl {...props} />;
}

export function ExternalLink(props: TasksExternalLinkProps) {
  const { ExternalLink: Impl } = useTasksHost();
  return <Impl {...props} />;
}

export function ForgeRefLink(props: TasksForgeRefLinkProps) {
  const { ForgeRefLink: Impl } = useTasksHost();
  return <Impl {...props} />;
}

export function MultiSelectMenu(props: TasksMultiSelectMenuProps) {
  const { MultiSelectMenu: Impl } = useTasksHost();
  return <Impl {...props} />;
}

export function Modal(props: TasksModalProps) {
  const { Modal: Impl } = useTasksHost();
  return <Impl {...props} />;
}

/** An issue's open/closed pill, drawn the way the forge feature draws it. */
export function IssueStatusPill({ issue }: { issue: ForgeIssue }) {
  const { IssueStatusPill: Impl } = useTasksHost();
  return <Impl issue={issue} />;
}

export function ActivityBadgeStack(props: { badges: readonly ActivityGlowBadge[]; className?: string }) {
  const { ActivityBadgeStack: Impl } = useTasksHost();
  return <Impl {...props} />;
}

/** A field with the app's AI wand — or, in an app with no headless agent, the plain field. */
export function WandField(props: TasksWandFieldProps) {
  const { WandField: Impl } = useTasksHost();
  if (Impl) return <Impl {...props} />;
  const label = props.inputProps?.['aria-label'];
  return props.multiline ? (
    <TextArea
      value={props.value}
      onChange={props.onChange}
      rows={props.rows ?? 4}
      {...(label !== undefined ? { label } : {})}
      {...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {})}
    />
  ) : (
    <TextField
      value={props.value}
      onChange={props.onChange}
      {...(label !== undefined ? { label } : {})}
      {...(props.placeholder !== undefined ? { placeholder: props.placeholder } : {})}
    />
  );
}

/** Present a markdown body as a deck — drawn only where the app composes the slides feature. */
export function PresentButton(props: { source: { content: string; label: string }; className?: string }) {
  const { PresentButton: Impl } = useTasksHost();
  return Impl ? <Impl {...props} /> : null;
}

/** Register a dismissable surface with the app's stack (Escape, outside click). A hook. */
export function useDismissable(options: TasksDismissableOptions): void {
  useTasksHost().useDismissable(options);
}

/** Toasts with an inline action. A hook. */
export function useToasts(): TasksToastApi {
  return useTasksHost().useToasts();
}

/** The list entrance cascade. A hook. */
export function useCascadeReveal(input: { revealKey: string | number }) {
  return useTasksHost().useCascadeReveal(input);
}

/**
 * How many items still get a distinct delay before the stagger flattens — the
 * app's `lib/cascade.ts` value, which a row's own "initial cascade" check reads.
 */
export const CASCADE_MAX_STEPS = 12;
