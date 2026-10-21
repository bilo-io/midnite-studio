import { cloneElement, type RefObject } from 'react';

import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

import { useForgeCapabilities } from './queries/forge-queries';
import {
  useForgeHost,
  useOptionalForgeHost,
  type ForgeDiffKit,
  type ForgeExternalLinkProps,
  type ForgeHost,
  type ForgeLayoutKey,
  type ForgeMultiSelectMenuProps,
  type ForgePopoverProps,
  type ForgeRefLinkProps,
  type ForgeTooltipProps,
  type ForgeTreeSectionProps,
  type ForgeUserAvatarProps,
} from './host';

/**
 * The chrome Reviews and Actions draw, resolved through the installed ports on
 * each render (Phase 113 Theme O) — the chats feature's `ui.tsx` pattern.
 *
 * The views imported these straight from the app's `components/`. The wrappers
 * keep those call sites as they were — same names, same props — while the
 * implementation is whichever the composing app installed. The host object is
 * stable, so each wrapper's component keeps its identity and nothing remounts.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

/**
 * Optional on purpose — the one wrapper that is: the status vocabulary draws
 * through it, and a status pill renders in places no forge host reaches. With
 * no host, the label still reaches the user as a native `title`.
 */
export function Tooltip(props: ForgeTooltipProps) {
  const host = useOptionalForgeHost();
  if (host) return <host.Tooltip {...props} />;
  return typeof props.label === 'string' ? cloneElement(props.children, { title: props.label }) : props.children;
}

export function UserAvatar(props: ForgeUserAvatarProps) {
  const { UserAvatar: Impl } = useForgeHost();
  return <Impl {...props} />;
}

export function Popover(props: ForgePopoverProps) {
  const { Popover: Impl } = useForgeHost();
  return <Impl {...props} />;
}

export function MultiSelectMenu(props: ForgeMultiSelectMenuProps) {
  const { MultiSelectMenu: Impl } = useForgeHost();
  return <Impl {...props} />;
}

export function TreeSection(props: ForgeTreeSectionProps) {
  const { TreeSection: Impl } = useForgeHost();
  return <Impl {...props} />;
}

export function ExternalLink(props: ForgeExternalLinkProps) {
  const { ExternalLink: Impl } = useForgeHost();
  return <Impl {...props} />;
}

export function ForgeRefLink(props: ForgeRefLinkProps) {
  const { ForgeRefLink: Impl } = useForgeHost();
  return <Impl {...props} />;
}

/*
  The host's hooks and functions under the names the views always called.
*/

/** The selected repository and checkout — the app's `useActiveWorktree`. */
export function useActiveWorktree(): { repoId: string | null; worktreePath?: string } {
  return useForgeHost().useActiveRepo();
}

export function useCascadeReveal(input: { revealKey: string | number }) {
  return useForgeHost().useCascadeReveal(input);
}

export function useDismiss(active: boolean, onDismiss: () => void, options?: { layer?: 'dialog' | 'popover' }): void {
  useForgeHost().useDismiss(active, onDismiss, options);
}

export function useForgeWritesEnabled(): boolean {
  return useForgeHost().useForgeWritesEnabled();
}

export function usePaneSize(key: ForgeLayoutKey) {
  return useForgeHost().usePaneSize(key);
}

/** `openLinkFromEvent`, as the host routes it. */
export function useOpenLink(): ForgeHost['openLink'] {
  return useForgeHost().openLink;
}

/**
 * The active repo's forge kind and its capability matrix — the app's hook of
 * the same name, over the host's `useForgeKind` instead of the git remotes query.
 */
export function useActiveForgeCapability(repoId: string | null) {
  const kind = useForgeHost().useForgeKind(repoId);
  const capabilities = useForgeCapabilities(kind ?? 'unknown');
  return { kind, capability: capabilities.data };
}

const NO_HOSTS: readonly string[] = [];
const useNoPreviewHosts = (): readonly string[] => NO_HOSTS;
const useNoAgent = () => null;
const useUnknownBlob = (): boolean | undefined => undefined;
const useNoFetchBase = () => null;

/** The embedded browser's preview-deployment hosts — none where the app has no browser. */
export function usePreviewDeployHosts(): readonly string[] {
  const useHosts = useForgeHost().previewDeploys?.useHosts ?? useNoPreviewHosts;
  return useHosts();
}

/** The agent hand-off, or null where the app has no agents. */
export function useAskAgent(): ReturnType<NonNullable<ForgeHost['useAskAgent']>> | null {
  const useAsk = useForgeHost().useAskAgent ?? useNoAgent;
  return useAsk();
}

/** Whether a PR's base blob is local — unknown (never "missing") where the app cannot tell. */
export function useBaseBlobExists(input: Parameters<NonNullable<ForgeDiffKit['useBaseBlobExists']>>[0]): boolean | undefined {
  const useExists = useForgeHost().diff.useBaseBlobExists ?? useUnknownBlob;
  return useExists(input);
}

/** "Fetch to compare", or null where the app cannot fetch. */
export function useFetchBase(target: { repoId: string | null; worktreePath?: string }): { mutate: () => void; isPending: boolean } | null {
  const useFetch = useForgeHost().diff.useFetchBase ?? useNoFetchBase;
  return useFetch(target);
}

export function useTooNarrowForSplit(ref: RefObject<HTMLElement | null>): boolean {
  return useForgeHost().diff.useTooNarrowForSplit(ref);
}

/** Present as a deck — the slides feature's button, where the app composes slides. */
export function PresentButton(props: { source: { content: string; label: string }; className?: string }) {
  const Impl = useForgeHost().PresentButton;
  return Impl ? <Impl {...props} /> : null;
}
