import { useMemo } from 'react';

import type { ChatsHost } from '@midnite/studio-feature-chats/renderer';
import { useOllamaModels, useOllamaStatus } from '@midnite/studio-feature-models/renderer';

import { AiComposer, AttachMenu, ProviderModelPicker, useComposerMic } from '../components/ai-thread';
import { resolveAgentIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { MultiSelectMenu } from '../components/multi-select-menu';
import { Popover } from '../components/popover';
import { Tooltip } from '../components/tooltip';
import { UserAvatar } from '../components/user-avatar';
import { DiffView } from '@midnite/studio-frame/diff';
import { MarkdownBody } from '../features/markdown/markdown-body';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { useAgents } from '../features/terminal/use-agents';
import { useRepos } from '../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';
import { CompanionToggle } from './chats/companion-toggle';

/**
 * Studio's side of the chats feature's host port (Phase 113 Theme N).
 *
 * Every member is the component, hook or function the Chats page imported
 * directly before it moved into the package, so the page, the composer and the
 * change review look and behave exactly as they did. Nothing Chats stores
 * moved: chats are main's `userData/chats/*.json`, the list width stays in
 * `ui-store`'s `layout.chatsListWidth`, and the primary agent, the forge
 * identity and the companion switch are still read from `ui-store`.
 */
export const STUDIO_CHATS_HOST = {
  Modal,
  Popover,
  Tooltip,
  UserAvatar,
  MarkdownBody,
  DiffView,
  MultiSelectMenu,
  AiComposer,
  AttachMenu,
  ProviderModelPicker,
  composerBoxClassName: MEDIA_PROMPT_BOX,
  useComposerMic,
  useRepos,
  useSelectedRepoId: () => useUiStore((s) => s.selectedRepoId),
  useListWidth: () => {
    const layout = useUiStore((s) => s.layout);
    const setLayout = useUiStore((s) => s.setLayout);
    return {
      size: layout.chatsListWidth,
      setSize: (value: number) => setLayout('chatsListWidth', value),
      initial: DEFAULT_LAYOUT.chatsListWidth,
      ...LAYOUT_BOUNDS.chatsListWidth,
    };
  },
  useThreadWidth: () => ({
    mode: useUiStore((s) => s.chatsWidthMode),
    setMode: useUiStore((s) => s.setChatsWidthMode),
  }),
  useAgentRoster: () => useAgents(),
  usePrimaryAgent: () => useUiStore((s) => s.primaryAgent),
  useLocalModels: () => {
    const status = useOllamaStatus();
    const models = useOllamaModels();
    const names = useMemo(() => (models.data ?? []).map((m) => m.name), [models.data]);
    return { reachable: status.data?.reachable === true, models: names };
  },
  useAccount: () => {
    const account = useUiStore((s) => s.forgeAccounts.find((a) => a.id === s.forgeActiveAccountId) ?? s.forgeAccounts[0]);
    return useMemo(
      () => (account ? { login: account.login, displayName: account.displayName, avatarUrl: account.avatarUrl ?? undefined } : undefined),
      [account],
    );
  },
  resolveAgentIcon,
  CompanionToggle,
  openWorkingCopyInGraph: (target) => useUiStore.getState().openWorkingCopyInGraph(target),
} satisfies ChatsHost;
