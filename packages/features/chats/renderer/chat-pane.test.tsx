/**
 * Vitest/jsdom: ChatPane's non-blocking handoff-only banner (Phase 146 Theme E).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { BUILTIN_AGENTS, CHAT_ENGINE_OLLAMA, type Chat } from '@midnite/studio-shared';

import { ChatPane } from './chat-pane';
import { resetChatsStore, useChatsStore } from './chats-store';
import { ChatsHostProvider, type ChatsHost } from './host';

function makeHost(): ChatsHost {
  const Dummy = () => null;
  return {
    Modal: ({ open, children }) => (open ? <div>{children}</div> : null),
    Popover: ({ trigger }) => <>{trigger}</>,
    Tooltip: ({ children }) => <>{children}</>,
    UserAvatar: Dummy,
    MarkdownBody: ({ content }) => <div>{content}</div>,
    DiffView: Dummy,
    MultiSelectMenu: Dummy,
    AiComposer: ({ ariaLabel, value, onChange, placeholder }) => (
      <textarea
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
    AttachMenu: Dummy,
    ProviderModelPicker: Dummy,
    composerBoxClassName: '',
    useComposerMic: () => ({ available: false, reason: 'none', held: false, pressStart: vi.fn() }),
    useRepos: () => ({ data: [{ id: 'repo-1', name: 'midnite-studio' }] }),
    useSelectedRepoId: () => 'repo-1',
    useListWidth: () => ({ size: 260, setSize: vi.fn(), initial: 260, min: 200, max: 400 }),
    useThreadWidth: () => ({ mode: 'default', setMode: vi.fn() }),
    useAgentRoster: () => ({ agents: [...BUILTIN_AGENTS], status: [] }),
    usePrimaryAgent: () => 'claude',
    useLocalModels: () => ({ reachable: false, models: [] }),
    useAccount: () => undefined,
    resolveAgentIcon: () => () => <span />,
  };
}

function makeChat(overrides: Partial<Chat> & Pick<Chat, 'id' | 'engine'>): Chat {
  return {
    title: 'Test chat',
    model: null,
    mode: 'edit',
    repoId: 'repo-1',
    repoName: 'midnite-studio',
    repoPath: '/tmp/midnite-studio',
    pinned: false,
    createdAt: 1000,
    updatedAt: 2000,
    session: null,
    messages: [{ id: 'm1', role: 'user', text: 'Hello', createdAt: 1000, status: 'done' }],
    ...overrides,
  };
}

function renderChatPane(chat: Chat) {
  resetChatsStore();
  useChatsStore.setState((state) => ({
    ...state,
    chats: { [chat.id]: chat },
    selectedId: chat.id,
  }));

  const { chrome } = createFrameChrome();

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <FrameChromeProvider chrome={chrome}>
        <ChatsHostProvider host={makeHost()}>
          <ChatPane selectedId={chat.id} />
        </ChatsHostProvider>
      </FrameChromeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetChatsStore();
});

describe('ChatPane handoff-only banner', () => {
  it('renders a non-blocking banner for handoff-only providers when linkedTerminalId is present', () => {
    renderChatPane(makeChat({ id: 'c1', engine: 'cursor', linkedTerminalId: 'term-1' }));

    const banner = screen.getByTestId('chat-handoff-only-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('one-way handoff');
    expect(banner.textContent).toContain('interactive Terminal turns are not synced back into this Chat thread');
    expect(screen.getByLabelText('Message')).toBeTruthy();
  });

  it('does not render the banner when linkedTerminalId is absent', () => {
    renderChatPane(makeChat({ id: 'c2', engine: 'aider' }));
    expect(screen.queryByTestId('chat-handoff-only-banner')).toBeNull();
  });

  it('does not render the banner for bidirectional providers even with linkedTerminalId', () => {
    renderChatPane(makeChat({ id: 'c3', engine: 'claude', linkedTerminalId: 'term-2' }));
    expect(screen.queryByTestId('chat-handoff-only-banner')).toBeNull();
  });

  it('does not render the banner for chat-only (ollama) providers', () => {
    renderChatPane(makeChat({ id: 'c4', engine: CHAT_ENGINE_OLLAMA }));
    expect(screen.queryByTestId('chat-handoff-only-banner')).toBeNull();
  });
});
