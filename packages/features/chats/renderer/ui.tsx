import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';
import type { PageWindowRole } from '@midnite/studio-shared';

import {
  useChatsHost,
  type ChatsAiComposerProps,
  type ChatsDiffViewProps,
  type ChatsModalProps,
  type ChatsMultiSelectMenuProps,
  type ChatsPopoverProps,
  type ChatsProviderModelPickerProps,
  type ChatsTooltipProps,
  type ChatsUserAvatarProps,
  type ChatsAttachOption,
} from './host';

/**
 * The chrome Chats draws, resolved through the installed port on each render
 * (Phase 113 Theme N).
 *
 * The chat view imported these straight from the app's `components/`. The
 * wrappers keep those call sites as they were — same names, same props — while
 * the implementation is whichever the composing app installed. The host object
 * is stable, so the component each wrapper resolves to keeps its identity
 * across renders and nothing remounts.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function PageDetachMark({ role }: { role: PageWindowRole }) {
  const { PageDetachMark: Impl } = useFrameChrome();
  return <Impl role={role} />;
}

export function Modal(props: ChatsModalProps) {
  const { Modal: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function Popover(props: ChatsPopoverProps) {
  const { Popover: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function Tooltip(props: ChatsTooltipProps) {
  const { Tooltip: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function UserAvatar(props: ChatsUserAvatarProps) {
  const { UserAvatar: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function MarkdownBody(props: { content: string; className?: string }) {
  const { MarkdownBody: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function DiffView(props: ChatsDiffViewProps) {
  const { DiffView: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function MultiSelectMenu(props: ChatsMultiSelectMenuProps) {
  const { MultiSelectMenu: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function AiComposer(props: ChatsAiComposerProps) {
  const { AiComposer: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function AttachMenu(props: { options: readonly ChatsAttachOption[]; label?: string; testId?: string }) {
  const { AttachMenu: Impl } = useChatsHost();
  return <Impl {...props} />;
}

export function ProviderModelPicker(props: ChatsProviderModelPickerProps) {
  const { ProviderModelPicker: Impl } = useChatsHost();
  return <Impl {...props} />;
}

/** The composer's mic — the host's hook, called like any other. */
export function useComposerMic(options?: { onTranscript?: (text: string) => void; onInterrupt?: () => void }) {
  return useChatsHost().useComposerMic(options);
}
