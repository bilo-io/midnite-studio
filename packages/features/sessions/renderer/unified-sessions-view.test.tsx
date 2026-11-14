import { useState, type ReactNode } from 'react';

import { createFrameChrome, FrameChromeProvider, type GitMultiSelectProps, type GitTooltipProps } from '@midnite/studio-frame';
import { BUILTIN_AGENTS, type ChatSummary, type TerminalSession, type UnifiedSessionViewMode } from '@midnite/studio-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SessionsHostProvider, type SessionsHost } from './host';
import { SessionsView } from './sessions-view';

/**
 * Unified Sessions + Chats sidebar & header toggle UI (Phase 146 Theme D).
 * jsdom — verifies deduplicated sidebar rows, mode badges, segmented Chat | Terminal
 * toggle state, ollama disabled-terminal tooltip, and composer draft preservation.
 */

function FakeChatPane({ selectedId, headerActions }: { selectedId: string | null; headerActions?: ReactNode }) {
  const [draft, setDraft] = useState('');
  return (
    <div data-testid="fake-chat-pane" data-chat-id={selectedId ?? ''}>
      <header>{headerActions}</header>
      <textarea aria-label="Chat composer" value={draft} onChange={(e) => setDraft(e.target.value)} />
    </div>
  );
}

const Tooltip = ({ label, children }: GitTooltipProps) => (
  <span data-tooltip={typeof label === 'string' ? label : undefined}>{children}</span>
);
const MultiSelectMenu = ({ label }: GitMultiSelectProps) => <button type="button">{label}</button>;

function chatSummary(overrides: Partial<ChatSummary> & Pick<ChatSummary, 'id' | 'engine' | 'title'>): ChatSummary {
  return {
    model: null,
    mode: 'edit',
    repoId: 'r1',
    repoName: 'repo-one',
    pinned: false,
    createdAt: 1000,
    updatedAt: 2000,
    messageCount: 1,
    preview: 'hello',
    running: false,
    pendingChanges: false,
    ...overrides,
  };
}

function renderUnified({
  liveSessions = [],
  chats = [],
  switchView = vi.fn().mockResolvedValue({ ok: true, value: { targetView: 'terminal', terminalId: 't1' } }),
}: {
  liveSessions?: TerminalSession[];
  chats?: ChatSummary[];
  switchView?: SessionsHost['chats'] extends infer C ? (C extends { switchView: infer S } ? S : never) : never;
}) {
  let liveId: string | null = null;
  let closedId: string | null = null;
  const selectChat = vi.fn();

  function FakeChatPane({ selectedId, headerActions }: { selectedId: string | null; headerActions?: ReactNode }) {
    const [draft, setDraft] = useState('');
    return (
      <div data-testid="fake-chat-pane" data-chat-id={selectedId ?? ''}>
        <header>{headerActions}</header>
        <textarea
          aria-label="Chat composer"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
    );
  }

  function Wrapper() {
    const [selectedLive, setSelectedLive] = useState<string | null>(liveId);
    const [selectedClosed, setSelectedClosed] = useState<string | null>(closedId);

    const host: SessionsHost = {
      useLiveSessions: () => liveSessions,
      useLiveStatus: () => ({ connectionState: 'open', activity: undefined, agentId: undefined }),
      useAgents: () => [...BUILTIN_AGENTS],
      useSelection: () => ({
        closedId: selectedClosed,
        selectClosed: (id) => {
          closedId = id;
          setSelectedClosed(id);
        },
        liveId: selectedLive,
        selectLive: (id) => {
          liveId = id;
          setSelectedLive(id);
        },
      }),
      useListWidth: () => ({ size: 280, setSize: () => {}, initial: 280, min: 200, max: 480 }),
      LivePane: ({ session }) => <div data-testid="fake-live-pane">{session.id}</div>,
      useCascadeReveal: () => ({ active: false, styleFor: () => ({}) }),
      useRevealCount: () => 0,
      resolveAgentIcon: () => () => <span data-testid="agent-icon" />,
      Tooltip,
      MultiSelectMenu,
      chats: {
        useChats: () => chats,
        selectChat,
        ChatPane: FakeChatPane,
        switchView,
      },
    };

    const kit = createFrameChrome();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return (
      <QueryClientProvider client={client}>
        <FrameChromeProvider chrome={kit.chrome}>
          <SessionsHostProvider host={host}>
            <SessionsView />
          </SessionsHostProvider>
        </FrameChromeProvider>
      </QueryClientProvider>
    );
  }

  return { ...render(<Wrapper />), selectChat, switchView };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Unified SessionsView (Phase 146 Theme D)', () => {
  it('deduplicates linked terminal/chat pairs into a single sidebar row with mode badge', () => {
    const liveSessions: TerminalSession[] = [
      {
        id: 't1',
        kind: 'agent',
        agentId: 'claude',
        repoId: 'r1',
        title: 'repo-one',
        name: 'Claude refactor',
        cwd: '/repo',
        createdAt: 1000,
        linkedChatId: 'c1',
        preferredView: 'chat',
      },
      {
        id: 'shell-1',
        kind: 'shell',
        repoId: 'r1',
        title: 'repo-one',
        name: 'zsh',
        cwd: '/repo',
        createdAt: 500,
      },
    ];
    const chats: ChatSummary[] = [
      chatSummary({
        id: 'c1',
        engine: 'claude',
        title: 'Claude refactor',
        linkedTerminalId: 't1',
        preferredView: 'chat',
      }),
    ];

    renderUnified({ liveSessions, chats });

    const list = screen.getByRole('list', { name: 'Sessions' });
    const claudeButtons = within(list).getAllByRole('button', { name: /Claude refactor/ });
    expect(claudeButtons).toHaveLength(1);
    expect(within(claudeButtons[0]!).getByTestId('session-mode-badge').textContent).toBe('Chat');

    // Plain shell terminal has no mode badge
    const shellButton = within(list).getByRole('button', { name: /zsh/ });
    expect(within(shellButton).queryByTestId('session-mode-badge')).toBeNull();
  });

  it('hides the Chat | Terminal toggle for standalone shell-only terminals without an agentId', () => {
    renderUnified({
      liveSessions: [
        {
          id: 'shell-1',
          kind: 'shell',
          repoId: 'r1',
          title: 'repo-one',
          name: 'zsh',
          cwd: '/repo',
          createdAt: 1000,
        },
      ],
    });

    fireEvent.click(screen.getByRole('button', { name: /zsh/ }));
    expect(screen.getByTestId('fake-live-pane')).toBeTruthy();
    expect(screen.queryByTestId('session-view-toggle')).toBeNull();
  });

  it('disables the Terminal segment with tooltip for ollama (chat-only) sessions', () => {
    const switchView = vi.fn();
    renderUnified({
      chats: [
        chatSummary({
          id: 'c-ollama',
          engine: 'ollama',
          title: 'Local Ollama',
        }),
      ],
      switchView,
    });

    fireEvent.click(screen.getByRole('button', { name: /Local Ollama/ }));

    const toggle = screen.getByTestId('session-view-toggle');
    const chatBtn = within(toggle).getByTestId('session-view-toggle-chat');
    const termBtn = within(toggle).getByTestId('session-view-toggle-terminal');

    expect(chatBtn.getAttribute('aria-pressed')).toBe('true');
    expect(termBtn.getAttribute('aria-disabled')).toBe('true');
    expect(termBtn.closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(
      'Ollama runs in Chat mode only — no interactive terminal CLI',
    );

    fireEvent.click(termBtn);
    expect(switchView).not.toHaveBeenCalled();
  });

  it('calls switchView when toggling Chat -> Terminal -> Chat and preserves ChatPane composer draft', async () => {
    function StatefulToggleHarness() {
      const [viewMode, setViewMode] = useState<UnifiedSessionViewMode>('chat');
      const [selectedLive, setSelectedLive] = useState<string | null>(null);
      const [selectedClosed, setSelectedClosed] = useState<string | null>(null);

      const liveSessions: TerminalSession[] = [
        {
          id: 't1',
          kind: 'agent',
          agentId: 'claude',
          repoId: 'r1',
          title: 'repo-one',
          name: 'Claude task',
          cwd: '/repo',
          createdAt: 1000,
          linkedChatId: 'c1',
          preferredView: viewMode,
        },
      ];
      const chats: ChatSummary[] = [
        chatSummary({
          id: 'c1',
          engine: 'claude',
          title: 'Claude task',
          linkedTerminalId: 't1',
          preferredView: viewMode,
        }),
      ];

      const host: SessionsHost = {
        useLiveSessions: () => liveSessions,
        useLiveStatus: () => ({ connectionState: 'open', activity: undefined, agentId: undefined }),
        useAgents: () => [...BUILTIN_AGENTS],
        useSelection: () => ({
          closedId: selectedClosed,
          selectClosed: setSelectedClosed,
          liveId: selectedLive,
          selectLive: setSelectedLive,
        }),
        useListWidth: () => ({ size: 280, setSize: () => {}, initial: 280, min: 200, max: 480 }),
        LivePane: ({ session }) => <div data-testid="fake-live-pane">{session.id}</div>,
        useCascadeReveal: () => ({ active: false, styleFor: () => ({}) }),
        useRevealCount: () => 0,
        resolveAgentIcon: () => () => <span data-testid="agent-icon" />,
        Tooltip,
        MultiSelectMenu,
        chats: {
          useChats: () => chats,
          selectChat: vi.fn(),
          ChatPane: FakeChatPane,
          switchView: async ({ targetView }) => {
            setViewMode(targetView);
            return {
              ok: true as const,
              value: { targetView, chatId: 'c1', terminalId: 't1', syncTier: 'bidirectional' as const },
            };
          },
        },
      };

      const kit = createFrameChrome();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <QueryClientProvider client={client}>
          <FrameChromeProvider chrome={kit.chrome}>
            <SessionsHostProvider host={host}>
              <SessionsView />
            </SessionsHostProvider>
          </FrameChromeProvider>
        </QueryClientProvider>
      );
    }

    render(<StatefulToggleHarness />);

    fireEvent.click(screen.getByRole('button', { name: /Claude task/ }));
    const composer = screen.getByLabelText('Chat composer') as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: 'unsent draft message' } });
    expect(composer.value).toBe('unsent draft message');

    // Switch Chat -> Terminal
    await act(async () => {
      fireEvent.click(screen.getByTestId('session-view-toggle-terminal'));
    });

    await waitFor(() => expect(screen.getByTestId('fake-live-pane')).toBeTruthy());
    expect(screen.getByTestId('unified-chat-pane-wrapper').className).toContain('hidden');

    // Switch Terminal -> Chat
    await act(async () => {
      fireEvent.click(screen.getByTestId('session-view-toggle-chat'));
    });

    await waitFor(() => expect(screen.queryByTestId('fake-live-pane')).toBeNull());
    expect((screen.getByLabelText('Chat composer') as HTMLTextAreaElement).value).toBe('unsent draft message');
  });
});
