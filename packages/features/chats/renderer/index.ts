import type { ComponentType } from 'react';

import type { ChatsManifest } from '../manifest';

/**
 * The chats feature's renderer half (Phase 113 Theme N). Needs the frame
 * (bridge, chrome port, lists, resizable panes) and its own {@link ChatsHost}
 * for what sits on app state: the AI-thread composer kit, modals, popovers,
 * markdown and diffs, the repositories, the roster and the local-model daemon.
 * The companion toggle and "open in graph" are optional — only Studio has them.
 *
 * `sideEffects: false` keeps an app that imports only the store (the graph's
 * agent avatars, the companion) from pulling the view into its entry chunk.
 */
export { chatsManifest, type ChatsManifest } from '../manifest';
export {
  ChatsHostProvider,
  useChatsHost,
  type ChatsAccount,
  type ChatsAiComposerProps,
  type ChatsAttachOption,
  type ChatsComposerMic,
  type ChatsDiffViewProps,
  type ChatsHost,
  type ChatsListWidth,
  type ChatsModalProps,
  type ChatsMultiSelectMenuProps,
  type ChatsMultiSelectOption,
  type ChatsPickerModel,
  type ChatsPickerProvider,
  type ChatsPopoverProps,
  type ChatsProviderModelPickerProps,
  type ChatsTooltipProps,
  type ChatsUserAvatarProps,
} from './host';

// The pieces other surfaces reuse: the chat store the graph and the companion
// read, the message bubbles the song chat renders, and the engine list.
export { useChatsStore } from './chats-store';
export { AssistantMessage, UserMessage } from './chat-message';
export { pickEngine, pickerModel, useChatEngines, wireModel, type ChatEngine } from './use-chat-engines';

type ViewIds = ChatsManifest['views'][number]['id'];

/** Each view as a loader, so the composer keeps it in its own lazy chunk. */
export const chatsViews = {
  chats: () => import('./chats-view').then((m) => m.ChatsView),
} satisfies Record<ViewIds, () => Promise<ComponentType>>;
