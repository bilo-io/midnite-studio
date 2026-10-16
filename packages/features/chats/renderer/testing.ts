/**
 * The chats feature's internals, for tests that exercise it *as a composing
 * app wires it* — Studio's `packages/app/src/compose/chats/` suite renders
 * these under its real providers and mock bridge (Phase 113 Theme N).
 *
 * Not for production code: an app composes the feature through
 * `@midnite/studio-feature-chats/renderer` and nothing else.
 */
export { ChatsView } from './chats-view';
export { ChatComposer, type ChatSettings } from './chat-composer';
export { coalesceEvents, isStreaming, mergeStreamed, reduceChatEvent, resetChatsStore, useChatsStore } from './chats-store';
export { useChatEvents } from './use-chat-events';
export { ChatChangesCard } from './chat-changes-card';
export { ChatThread, isNearBottom, scrollToBottom } from './chat-thread';
export { formatElapsed, formatTokens, ThinkingPanel } from './thinking-panel';
