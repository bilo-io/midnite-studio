/**
 * Vitest/jsdom: the Chats page assembled over the mock bridge — explorer filters
 * and actions, sending and streaming, markdown rendering, Stop, and the whole
 * review flow (card, modal, per-file / per-hunk / all decisions, conflicts).
 * None of it needs a real browser: no layout measurement, drag or canvas — the
 * diff rows are virtualised, which `vitest-setup.ts`'s ResizeObserver stub feeds.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chat, ChatMessage } from '@midnite/studio-shared';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { ChatsView } from './chats-view';
import { resetChatsStore, useChatsStore } from './chats-store';

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
const DAY = 86_400_000;

const msg = (id: string, role: 'user' | 'assistant', text: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  role,
  text,
  createdAt: NOW,
  status: 'done',
  ...over,
});

const seedChat = (id: string, over: Partial<Chat> = {}, messages: ChatMessage[] = [msg(`${id}-u`, 'user', `question ${id}`), msg(`${id}-a`, 'assistant', `answer ${id}`)]): Chat => ({
  id,
  title: `Chat ${id}`,
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: NOW - DAY,
  updatedAt: NOW - 1000,
  messages,
  session: null,
  ...over,
});

const base: MockFixtures = { ...fixtures };

async function open(chats: MockFixtures['chats'] = {}, extra: Partial<MockFixtures> = {}) {
  renderView(<ChatsView />, { fixtures: { ...base, ...extra, chats } });
  await screen.findByTestId('chats-explorer');
}

const rows = () => screen.queryAllByTestId('chat-row');
const composer = () => screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;

async function type(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
}

beforeEach(() => {
  resetChatsStore();
  window.localStorage.clear();
  useUiStore.setState({ selectedRepoId: null, companionEnabled: false, companionPanelOpen: false });
});
afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('empty states', () => {
  it('shows the explorer empty state and the new-chat screen with suggestions', async () => {
    await open();
    await screen.findByText('No chats yet');
    expect(screen.getByTestId('chat-empty-state')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Suggestions' })).toBeTruthy();
    expect(composer()).toBeTruthy();
  });

  it('suggestions need a repository, and fill the composer when picked', async () => {
    await open();
    const suggestion = screen.getByTestId('chat-suggestion-explain') as HTMLButtonElement;
    expect(suggestion.disabled).toBe(true);
    cleanup();
    useChatsStore.setState({ draft: { engine: 'claude', model: null, mode: 'ask', repoId: 'repo:/x/app' } });
    await open();
    fireEvent.click(screen.getByTestId('chat-suggestion-explain'));
    expect(composer().value).toMatch(/tour of this repository/);
    expect(document.activeElement).toBe(composer());
  });
});

describe('explorer', () => {
  const seeded = [
    seedChat('a', { title: 'Fix login bug', repoId: 'repo:/x/app', repoName: 'app', engine: 'claude', updatedAt: NOW - 1000 }),
    seedChat('b', { title: 'Release notes', repoId: 'repo:/x/app', repoName: 'app', engine: 'codex', pinned: true, updatedAt: NOW - 3 * DAY }),
    seedChat('c', { title: 'Quick question', engine: 'ollama', updatedAt: NOW - 20 * DAY }),
  ];

  it('lists chats grouped: pinned first, then by repository, then no repository', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    const headers = screen.getAllByRole('button', { name: /^(Collapse|Expand) / }).map((b) => b.getAttribute('aria-label'));
    expect(headers).toEqual(['Collapse Pinned', 'Collapse app', 'Collapse No repository']);
    expect(screen.getByTestId('chats-count').textContent).toBe('3');
  });

  it('searches by title, and says so when nothing matches, with a way back', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    const search = screen.getByRole('searchbox', { name: /Search chats/ });
    fireEvent.change(search, { target: { value: 'login' } });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Fix login bug')]);
    fireEvent.change(search, { target: { value: 'zzz-nothing' } });
    expect(screen.getByTestId('chats-no-match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(rows()).toHaveLength(3);
  });

  it('filters by engine through the multi-select', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /All engines/ }));
    const list = await screen.findByRole('listbox', { name: 'Filter chats by engine' });
    fireEvent.click(within(list).getByRole('option', { name: /Codex/ }));
    expect(rows().map((r) => r.getAttribute('data-chat-id'))).toEqual(['b']);
  });

  it('filters by pinned status and by repository', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /All chats/ }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Filter chats by pinned' })).getByRole('option', { name: /^Pinned/ }));
    expect(rows().map((r) => r.getAttribute('data-chat-id'))).toEqual(['b']);
  });

  it('filters by date', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: /Any time/ }));
    fireEvent.click(within(await screen.findByRole('listbox', { name: 'Filter chats by date' })).getByRole('option', { name: 'Today' }));
    expect(rows().map((r) => r.getAttribute('data-chat-id'))).toEqual(['a']);
  });

  it('opens a chat on click and shows its thread', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(rows().find((r) => r.getAttribute('data-chat-id') === 'a')!).getByRole('button', { name: /Fix login bug/ }));
    await screen.findByText('answer a');
    expect(screen.getByText('question a')).toBeTruthy();
    expect(screen.getByTestId('chat-title').textContent).toBe('Fix login bug');
  });

  it('collapses a group', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    const header = screen.getByRole('button', { name: 'Collapse app' });
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('renames through a prompt, pins, and deletes through a confirm', async () => {
    await open({ seed: [seeded[0]!] });
    await waitFor(() => expect(rows()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Rename chat' }));
    const input = await screen.findByLabelText('Title');
    fireEvent.change(input, { target: { value: 'Login, fixed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(rows()[0]!.textContent).toContain('Login, fixed'));

    fireEvent.click(screen.getByRole('button', { name: 'Pin chat' }));
    await screen.findByRole('button', { name: 'Collapse Pinned' });
    expect(screen.getByRole('button', { name: 'Unpin chat' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete chat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(rows()).toHaveLength(0));
  });

  it('flags a chat that is answering and one with changes waiting', async () => {
    const waiting = seedChat('w', { title: 'Has changes' }, [
      msg('w-u', 'user', 'go'),
      msg('w-a', 'assistant', 'done', { changeSet: { id: 'cs', createdAt: 1, status: 'pending', files: [{ path: 'a.ts', oldPath: null, change: 'modified', binary: false, insertions: 1, deletions: 0, preview: [], hunks: [{ header: '@@', insertions: 1, deletions: 0, status: 'pending' }], fileStatus: 'pending', status: 'pending' }] } }),
    ]);
    await open({ seed: [waiting] });
    await screen.findByTestId('chat-row-pending');
  });

  it('"New chat" returns to the empty composer', async () => {
    await open({ seed: seeded });
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(rows()[0]!).getByRole('button', { name: /Quick question|Release notes|Fix login bug/ }));
    await screen.findByTestId('chat-title');
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
    await screen.findByTestId('chat-empty-state');
  });
});

describe('sending and streaming', () => {
  async function ready(chats: MockFixtures['chats'] = {}) {
    useChatsStore.setState({ draft: { engine: 'claude', model: null, mode: 'ask', repoId: null } });
    await open(chats);
  }

  it('sends on Enter, shows the user bubble, streams the reply, and names the chat', async () => {
    await ready({ reply: 'Hello from the agent.' });
    await type('Say hello');
    fireEvent.keyDown(composer(), { key: 'Enter' });

    await screen.findByText('Say hello', { selector: '[data-testid="chat-message-user"] div' });
    await screen.findByText('Hello from the agent.');
    expect(composer().value).toBe('');
    await waitFor(() => expect(rows()[0]!.textContent).toContain('Say hello'));
    expect(screen.getByTestId('chat-title').textContent).toBe('Say hello');
  });

  it('Shift+Enter does not send', async () => {
    await ready();
    await type('draft');
    fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: true });
    expect(screen.queryByTestId('chat-thread')).toBeNull();
    expect(composer().value).toBe('draft');
  });

  it('shows Stop left of Send while streaming and kills the reply on click', async () => {
    await ready({ reply: 'A reply long enough that it is still streaming when we press stop.' });
    await type('go');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    const stop = await screen.findByRole('button', { name: 'Stop' });
    expect(stop.nextElementSibling).toBe(screen.getByTestId('chat-input-send'));
    expect(screen.getByTestId('chat-answering')).toBeTruthy();

    fireEvent.click(stop);
    await screen.findByTestId('chat-stopped');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect(screen.queryByTestId('chat-answering')).toBeNull();
  });

  it('puts the message back and says why when the send fails', async () => {
    await ready({ sendError: 'The agent is not installed.' });
    await type('keep me');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    await waitFor(() => expect(composer().value).toBe('keep me'));
    expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('The agent is not installed.');
  });

  it('keeps what you were typing in a chat while you look at another', async () => {
    await open({ seed: [seedChat('a'), seedChat('b')] });
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.click(within(rows()[0]!).getAllByRole('button')[0]!);
    await screen.findByTestId('chat-title');
    const first = screen.getByTestId('chat-title').textContent;
    await type('half-written thought');
    fireEvent.click(within(rows().find((r) => !r.textContent!.includes(first!))!).getAllByRole('button')[0]!);
    await waitFor(() => expect(screen.getByTestId('chat-title').textContent).not.toBe(first));
    expect(composer().value).toBe('');
    fireEvent.click(within(rows().find((r) => r.textContent!.includes(first!))!).getAllByRole('button')[0]!);
    await waitFor(() => expect(composer().value).toBe('half-written thought'));
  });

  it('renders the reply as pretty markdown: headings, lists, tables, links, inline and fenced code with a copy button', async () => {
    const reply = [
      '## The plan',
      '',
      'Use `pnpm test` first.',
      '',
      '- one',
      '- two',
      '',
      '| name | value |',
      '| --- | --- |',
      '| a | 1 |',
      '',
      'See [the docs](https://example.com/docs).',
      '',
      '```ts',
      'const answer = 42;',
      '```',
    ].join('\n');
    await ready({ reply });
    await type('markdown please');
    fireEvent.click(screen.getByTestId('chat-input-send'));

    await screen.findByRole('heading', { name: 'The plan', level: 2 });
    // The reply streams in three pieces; wait for the last one before asserting the whole.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    expect(screen.getAllByRole('listitem').some((li) => li.textContent === 'one')).toBe(true);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeTruthy();
    const link = screen.getByRole('link', { name: 'the docs' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    expect(screen.getByText('pnpm test').tagName).toBe('CODE');
    const block = await screen.findByTestId('md-code-block');
    expect(within(block).getByTestId('md-code-lang').textContent).toBe('ts');
    expect(within(block).getByRole('button', { name: 'Copy code' })).toBeTruthy();
  });

  it('the copy button on a reply copies its text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await ready({ reply: 'copy this text' });
    await type('q');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    await screen.findByText('copy this text');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(writeText).toHaveBeenCalledWith('copy this text');
  });

  it('retry re-asks the same question and replaces the reply', async () => {
    await ready({ reply: 'same answer' });
    await type('retry me');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    await screen.findByText('same answer');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByTestId('chat-message-assistant')).toHaveLength(1));
    await screen.findByText('same answer');
    expect(screen.getAllByTestId('chat-message-user')).toHaveLength(1);
  });

  it('edit rewinds to the edited message and re-asks', async () => {
    await ready({ reply: 'ok' });
    await type('original wording');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    await screen.findByText('ok');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const field = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(field, { target: { value: 'better wording' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    const thread = screen.getByTestId('chat-thread');
    await within(thread).findByText('better wording');
    expect(within(thread).queryByText('original wording')).toBeNull();
    await within(thread).findByText('ok');
    expect(within(thread).getAllByTestId('chat-message-user')).toHaveLength(1);
  });

  it('shows the engine, mode and repo pickers and lets the draft change before the first send', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: /Mode: Ask/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Edit/ }));
    expect(useChatsStore.getState().draft.mode).toBe('edit');
  });

  it('toggles the companion from the composer', async () => {
    await ready();
    fireEvent.click(screen.getByTestId('chat-companion-toggle'));
    expect(useUiStore.getState()).toMatchObject({ companionEnabled: true, companionPanelOpen: true });
  });
});

describe('reviewing changes', () => {
  async function withChanges(extra: MockFixtures['chats'] = {}) {
    useChatsStore.setState({ draft: { engine: 'claude', model: null, mode: 'edit', repoId: null } });
    await open({ reply: 'I updated the greeting.', changes: true, ...extra });
    await type('update the greeting');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    return screen.findByTestId('chat-changes-card');
  }

  it('shows an inline card with the files, +/- counts, a few diff lines and a pending state', async () => {
    const card = await withChanges();
    expect(card.dataset['status']).toBe('pending');
    expect(within(card).getByText('2 files changed')).toBeTruthy();
    expect(within(card).getByText('src/greeting.ts')).toBeTruthy();
    expect(within(card).getByText('src/config.ts')).toBeTruthy();
    const previews = within(card).getAllByTestId('chat-changes-preview');
    expect(previews[0]!.textContent).toContain('+  return `Hello, ${name}!`;');
    expect(within(card).getByTestId('chat-changes-status').textContent).toBe('Pending review');
  });

  it('opens a larger modal with the full diff when the card is clicked', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    const modal = await screen.findByTestId('chat-changes-modal');
    expect(within(modal).getAllByTestId('chat-modal-file')).toHaveLength(2);
    // Diff cells split a line into highlight/intraline spans, so read the text of the whole pane.
    await waitFor(() => expect(modal.textContent).toContain('export function greet(name: string) {'));
    expect(modal.textContent).toContain("return 'Hello ' + name;");
    expect(modal.textContent).toContain('return `Hello, ${name}!`;');
    expect(within(modal).getByText('Hunk 1')).toBeTruthy();
    expect(within(modal).getByText('Hunk 2')).toBeTruthy();
  });

  it('Accept all on the card accepts every file', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-accept-all'));
    await waitFor(() => expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('accepted'));
    expect(screen.queryByTestId('chat-changes-accept-all')).toBeNull();
  });

  it('Reject all on the card rejects every file', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-reject-all'));
    await waitFor(() => expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('rejected'));
  });

  it('accepts one hunk at a time, the file turning partial, then accepted', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    const modal = await screen.findByTestId('chat-changes-modal');
    fireEvent.click(await within(modal).findByTestId('chat-modal-accept-hunk-1'));
    await within(modal).findByTestId('chat-modal-hunk-status-1');
    expect(within(modal).getByTestId('chat-modal-hunk-status-1').textContent).toBe('Accepted');
    expect(within(modal).getAllByTestId('chat-modal-file')[0]!.dataset['status']).toBe('partial');
    expect(within(modal).getByTestId('chat-modal-status').textContent).toBe('Partially accepted');

    fireEvent.click(within(modal).getByTestId('chat-modal-reject-hunk-0'));
    await waitFor(() => expect(within(modal).getByTestId('chat-modal-hunk-status-0').textContent).toBe('Rejected'));
    // One accepted, one rejected: decided, and the file reads as partial.
    expect(within(modal).getAllByTestId('chat-modal-file')[0]!.dataset['status']).toBe('partial');
  });

  it('accepts or rejects a whole file from the modal', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    const modal = await screen.findByTestId('chat-changes-modal');
    fireEvent.click(within(modal).getByTestId('chat-modal-accept-file'));
    await waitFor(() => expect(within(modal).getAllByTestId('chat-modal-file')[0]!.dataset['status']).toBe('accepted'));
    fireEvent.click(within(modal).getAllByTestId('chat-modal-file')[1]!);
    fireEvent.click(within(modal).getByTestId('chat-modal-reject-file'));
    await waitFor(() => expect(within(modal).getAllByTestId('chat-modal-file')[1]!.dataset['status']).toBe('rejected'));
    expect(within(modal).getByTestId('chat-modal-status').textContent).toBe('Partially accepted');
  });

  it('Accept all and Reject all in the modal decide everything, and disable once nothing is left', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    const modal = await screen.findByTestId('chat-changes-modal');
    fireEvent.click(within(modal).getByTestId('chat-modal-accept-all'));
    await waitFor(() => expect(within(modal).getByTestId('chat-modal-status').textContent).toBe('Accepted'));
    expect((within(modal).getByTestId('chat-modal-accept-all') as HTMLButtonElement).disabled).toBe(true);
    expect((within(modal).getByTestId('chat-modal-reject-all') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders a conflict in the modal: a banner, the file marked, and the rest applied', async () => {
    const card = await withChanges({ conflictOn: 'src/config.ts' });
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    const modal = await screen.findByTestId('chat-changes-modal');
    fireEvent.click(within(modal).getByTestId('chat-modal-accept-all'));

    const banner = await within(modal).findByTestId('chat-modal-conflict');
    expect(banner.textContent).toContain('src/config.ts');
    expect(banner.textContent).toContain('Everything else went through');
    const files = within(modal).getAllByTestId('chat-modal-file');
    expect(files.map((f) => f.dataset['status'])).toEqual(['accepted', 'conflict']);
    expect(within(modal).getByTestId('chat-modal-status').textContent).toBe('Conflict');

    // Rejecting the conflicting file clears it.
    fireEvent.click(files[1]!);
    expect(within(modal).getByTestId('chat-modal-file-conflict').textContent).toMatch(/working tree changed/);
    fireEvent.click(within(modal).getByTestId('chat-modal-reject-file'));
    await waitFor(() => expect(within(modal).getAllByTestId('chat-modal-file')[1]!.dataset['status']).toBe('rejected'));
  });

  it('closes the modal on Escape and the card keeps its state', async () => {
    const card = await withChanges();
    fireEvent.click(within(card).getByTestId('chat-changes-open'));
    await screen.findByTestId('chat-changes-modal');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('chat-changes-modal')).toBeNull());
    expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('pending');
  });

  it('no card when the chat is read-only (Ask mode)', async () => {
    useChatsStore.setState({ draft: { engine: 'claude', model: null, mode: 'ask', repoId: null } });
    await open({ reply: 'just an answer', changes: true });
    await type('q');
    fireEvent.click(screen.getByTestId('chat-input-send'));
    await screen.findByText('just an answer');
    await act(async () => {});
    expect(screen.queryByTestId('chat-changes-card')).toBeNull();
  });
});
