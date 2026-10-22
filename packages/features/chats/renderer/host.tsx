import {
  createContext,
  useContext,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import type { AgentDefinition, AgentStatus, ChatWidthMode, FileDiff, RepoDescriptor } from '@midnite/studio-shared';

/**
 * The chats feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme N).
 *
 * Chats draws on a lot of chrome that sits on app state, and every seam is
 * declared here with only the props Chats passes, so the feature reads as it
 * always did while the implementation is whichever the composing app installed:
 *
 * - **Chrome with occluders or portals** — `Modal`, `Popover`, `Tooltip`,
 *   `MultiSelectMenu` count occluders and clamp to the content area.
 * - **The shared AI-thread kit** — the composer, its mic, the "+" attach menu
 *   and the provider/model picker are used by ten surfaces; they stay in the app.
 * - **Rendering** — markdown and diffs are Monaco/Shiki-backed app features.
 * - **App state** — the open repositories, the selected repo, the persisted
 *   list width, the agent roster, the local-model daemon, the forge identity.
 *
 * Two members are **optional**, for what only Studio has: `CompanionToggle`
 * (the voice companion) and `openWorkingCopyInGraph` (the graph). Agents leaves
 * them out and the chat header simply omits those controls.
 */

export type ChatsModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  testId?: string;
};

export type ChatsPopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
  label: string;
  title?: string;
  disabled?: boolean;
  panelClassName?: string;
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  testId?: string;
};

export type ChatsTooltipProps = {
  label: ReactNode;
  side?: 'top' | 'bottom' | 'right';
  children: ReactElement<Record<string, unknown>>;
};

export type ChatsUserAvatarProps = {
  login?: string | null | undefined;
  name?: string | null | undefined;
  src?: string | null | undefined;
  size?: number;
  withTooltip?: boolean;
};

export type ChatsDiffViewProps = {
  diff: FileDiff | undefined;
  isLoading?: boolean;
  emptyMessage?: string | null;
  /** Controls at the right end of each `@@` hunk header — per-hunk accept/reject. */
  renderHunkActions?: (hunkIndex: number) => ReactNode;
};

export type ChatsMultiSelectOption = {
  value: string;
  label: string;
  keywords?: string;
  icon?: ReactNode;
  meta?: ReactNode;
};

export type ChatsMultiSelectMenuProps = {
  options: readonly ChatsMultiSelectOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  icon: ReactNode;
  allLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  label: string;
  summarise: (count: number) => string;
};

/** The composer's mic, as `useComposerMic` returns it — opaque to Chats, handed straight to the composer. */
export type ChatsComposerMic = {
  available: boolean;
  reason: string;
  held: boolean;
  pressStart: () => void;
  conversation?: boolean;
  listening?: boolean;
  armed?: boolean;
  toggleConversation?: () => void;
  toggleListening?: () => void;
  autoSendSeq?: number;
  dictationSeq?: number;
};

export type ChatsAiComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  mic?: ChatsComposerMic;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  above?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  sendTooltip?: string;
  streaming?: boolean;
  onStop?: () => void;
  maxTextareaHeight?: number;
  testIdPrefix?: string;
  className?: string;
  boxClassName?: string;
  renderOverlay?: (text: string) => ReactNode;
  onCaretChange?: (caret: number) => void;
};

export type ChatsAttachOption = {
  id: string;
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  disabled?: boolean;
  reason?: string;
};

export type ChatsPickerProvider = {
  id: string;
  label: string;
  icon: IconComponent;
  color?: string;
  recommended?: boolean;
  disabled?: boolean;
  reason?: string;
};

export type ChatsPickerModel = { id: string; label: string; recommended?: boolean };

export type ChatsProviderModelPickerProps = {
  providers: readonly ChatsPickerProvider[];
  provider: string;
  onProviderChange: (id: string) => void;
  models: readonly ChatsPickerModel[];
  model: string;
  onModelChange: (id: string) => void;
  testId?: string;
};

/** A persisted pane width: the stored size, how to store one, and its bounds. */
export type ChatsListWidth = {
  size: number;
  setSize: (value: number) => void;
  initial: number;
  min: number;
  max: number;
};

/** The viewer's thread width mode, and how to change it. Persisted by the host, like the list width. */
export type ChatsThreadWidth = {
  mode: ChatWidthMode;
  setMode: (mode: ChatWidthMode) => void;
};

/** Who "You" is in a thread — the active forge account, when one is signed in. */
export type ChatsAccount = { login?: string | undefined; displayName?: string | undefined; avatarUrl?: string | undefined };

export type ChatsHost = {
  Modal: ComponentType<ChatsModalProps>;
  Popover: ComponentType<ChatsPopoverProps>;
  Tooltip: ComponentType<ChatsTooltipProps>;
  UserAvatar: ComponentType<ChatsUserAvatarProps>;
  MarkdownBody: ComponentType<{ content: string; className?: string }>;
  DiffView: ComponentType<ChatsDiffViewProps>;
  MultiSelectMenu: ComponentType<ChatsMultiSelectMenuProps>;
  AiComposer: ComponentType<ChatsAiComposerProps>;
  AttachMenu: ComponentType<{ options: readonly ChatsAttachOption[]; label?: string; testId?: string }>;
  ProviderModelPicker: ComponentType<ChatsProviderModelPickerProps>;
  /** The gradient-bordered wrapper class the composer's box wears. */
  composerBoxClassName: string;
  /** The mic hook the composer takes. */
  useComposerMic: (options?: { onTranscript?: (text: string) => void; onInterrupt?: () => void }) => ChatsComposerMic;
  /** The open repositories. A hook. */
  useRepos: () => { data: readonly Pick<RepoDescriptor, 'id' | 'name'>[] | undefined };
  /** The repository the app has selected, or `null`. A hook. */
  useSelectedRepoId: () => string | null;
  /** The persisted width of the chat list pane. A hook. */
  useListWidth: () => ChatsListWidth;
  /** The persisted width mode of the thread. A hook. */
  useThreadWidth: () => ChatsThreadWidth;
  /** The agent roster and what main could learn about it on this machine. A hook. */
  useAgentRoster: () => { agents: AgentDefinition[]; status: AgentStatus[] };
  /** The agent the app treats as primary — the default engine. A hook. */
  usePrimaryAgent: () => string;
  /** The local-model daemon: whether it answers, and the names of the models it has. A hook. */
  useLocalModels: () => { reachable: boolean; models: string[] };
  /** The account "You" is shown as. A hook. */
  useAccount: () => ChatsAccount | undefined;
  /** The glyph for an agent (its brand mark, or a terminal for an unknown one). */
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
  /** The voice-companion toggle in the chat header. Absent where the app has no companion. */
  CompanionToggle?: ComponentType;
  /** Takes the graph to a chat's worktree. Absent where the app has no graph. */
  openWorkingCopyInGraph?: (target: { repoId: string; worktreePath: string }) => void;
};

const ChatsHostContext = createContext<ChatsHost | null>(null);

export function ChatsHostProvider({ host, children }: { host: ChatsHost; children: ReactNode }) {
  return <ChatsHostContext.Provider value={host}>{children}</ChatsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the composer and the thread would not render. */
export function useChatsHost(): ChatsHost {
  const host = useContext(ChatsHostContext);
  if (!host) throw new Error('The chats feature must be rendered inside <ChatsHostProvider>');
  return host;
}
