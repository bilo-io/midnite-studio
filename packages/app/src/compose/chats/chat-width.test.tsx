/**
 * Vitest/jsdom: the Chats thread's width toggle, as Studio wires it — the
 * group in the pane's top-right, the pressed state, the classes each mode puts
 * on the thread, and the mode's home in `ui-store` (persisted, versioned).
 * No layout is measured: which max-width applies is a class, and the e2e
 * `chats-layout.spec.ts` already proves the default column against real boxes.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chat, ChatMessage } from '@midnite/studio-shared';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useUiStore } from '../../store/ui-store';
import { ChatsView, resetChatsStore } from '@midnite/studio-feature-chats/renderer/testing';

vi.mock('../../lib/highlighter', () => {
  const hl = {
    getLoadedLanguages: () => [],
    loadLanguage: async () => {},
    codeToHtml: (code: string) => `<pre class="shiki"><code>${code}</code></pre>`,
    codeToTokensBase: () => [[]],
  };
  return { getHighlighter: async () => hl, resolveHighlightTheme: async () => 'github-dark' };
});

const NOW = Date.now();

const msg = (id: string, role: 'user' | 'assistant', text: string): ChatMessage => ({ id, role, text, createdAt: NOW, status: 'done' });

const seeded: Chat = {
  id: 'w1',
  title: 'Width check',
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  messages: [msg('u', 'user', 'how wide?'), msg('a', 'assistant', 'as wide as you like')],
  session: null,
};

async function openSeededChat() {
  renderView(<ChatsView />, { fixtures: { ...fixtures, chats: { seed: [seeded] } } as MockFixtures });
  await screen.findByTestId('chats-explorer');
  await waitFor(() => expect(screen.queryAllByTestId('chat-row')).toHaveLength(1));
  fireEvent.click(screen.getAllByTestId('chat-row')[0]!);
  return screen.findByTestId('chat-thread');
}

const toggle = () => within(screen.getByTestId('chat-width-toggle'));
const pressed = () =>
  toggle()
    .getAllByRole('button')
    .filter((b) => b.getAttribute('aria-pressed') === 'true')
    .map((b) => b.getAttribute('aria-label'));

beforeEach(() => {
  resetChatsStore();
  window.localStorage.clear();
  useUiStore.setState({ selectedRepoId: null, companionEnabled: false, companionPanelOpen: false, chatsWidthMode: 'default' });
});
afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('the thread width toggle', () => {
  it('sits in the chat header with three modes, the current one pressed', async () => {
    await openSeededChat();
    const header = screen.getByRole('banner');
    const group = within(header).getByRole('group', { name: 'Thread width' });
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Default width', 'Wider thread', 'Full width']);
    expect(pressed()).toEqual(['Default width']);
  });

  it('is there before the first message too, over the new-chat screen', async () => {
    renderView(<ChatsView />, { fixtures: { ...fixtures, chats: {} } as MockFixtures });
    await screen.findByTestId('chat-empty-state');
    expect(screen.getByRole('group', { name: 'Thread width' })).toBeTruthy();
  });

  it('each mode re-dresses the thread column and lands in ui-store', async () => {
    const thread = await openSeededChat();
    const column = () => screen.getByTestId('chat-thread-column');
    expect(thread.getAttribute('data-width-mode')).toBe('default');
    expect(column().className).toContain('max-w-[calc(50rem+4.5rem)]');
    expect(column().parentElement?.className).toContain('px-16');

    fireEvent.click(toggle().getByRole('button', { name: 'Wider thread' }));
    expect(useUiStore.getState().chatsWidthMode).toBe('wider');
    expect(thread.getAttribute('data-width-mode')).toBe('wider');
    expect(column().className).toContain('max-w-[calc(64rem+4.5rem)]');
    expect(column().parentElement?.className).toContain('px-16');
    expect(pressed()).toEqual(['Wider thread']);

    fireEvent.click(toggle().getByRole('button', { name: 'Full width' }));
    expect(useUiStore.getState().chatsWidthMode).toBe('full');
    expect(column().className).toContain('max-w-full');
    expect(column().parentElement?.className).toContain('px-4');
    expect(column().parentElement?.className).not.toContain('px-16');
    expect(pressed()).toEqual(['Full width']);

    // The composer never moves: it keeps its own column in every mode.
    expect(screen.getByTestId('chat-composer').closest('.max-w-\\[50rem\\]')).toBeTruthy();
  });

  it('glides between modes, and only when motion is not reduced', async () => {
    await openSeededChat();
    const column = screen.getByTestId('chat-thread-column');
    expect(column.className).toContain('transition-[max-width,padding]');
    expect(column.className).toContain('duration-[250ms]');
    expect(column.className).toContain('[html[data-motion=reduced]_&]:transition-none');
    expect(column.parentElement?.className).toContain('duration-[250ms]');
  });
});

describe('the width mode in ui-store', () => {
  it('is persisted', () => {
    useUiStore.getState().setChatsWidthMode('wider');
    const partialize = useUiStore.persist.getOptions().partialize!;
    expect(partialize(useUiStore.getState()).chatsWidthMode).toBe('wider');
  });

  it('v35 → v36 seeds the default, keeping a mode a profile already chose', () => {
    const migrate = useUiStore.persist.getOptions().migrate!;
    expect((migrate({}, 35) as { chatsWidthMode: string }).chatsWidthMode).toBe('default');
    expect((migrate({ chatsWidthMode: 'full' }, 35) as { chatsWidthMode: string }).chatsWidthMode).toBe('full');
  });

  it('an unknown stored mode merges back to the default', () => {
    const merge = useUiStore.persist.getOptions().merge!;
    const current = useUiStore.getState();
    expect(merge({ chatsWidthMode: 'enormous' }, current).chatsWidthMode).toBe('default');
    expect(merge({ chatsWidthMode: 'full' }, current).chatsWidthMode).toBe('full');
  });
});
