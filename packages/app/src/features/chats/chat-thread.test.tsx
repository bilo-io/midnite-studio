/**
 * Vitest/jsdom: the thread's scroll bookkeeping and message chrome. jsdom has no
 * layout, so scroll geometry is faked with defineProperty on the scroller — what
 * is asserted is the DECISION (pin, release, jump, smooth or instant), not pixels;
 * the real-layout behaviour is covered once in `e2e/chats-scroll.spec.ts`.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Chat, ChatMessage } from '@midnite/studio-shared';

import { ChatThread, isNearBottom, scrollToBottom } from './chat-thread';

vi.mock('../markdown/markdown-body', () => ({ MarkdownBody: ({ content }: { content: string }) => <div data-testid="md">{content}</div> }));

const m = (id: string, role: 'user' | 'assistant', text: string, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, role, text, createdAt: 1, status: 'done', ...over });

const chat = (messages: ChatMessage[], id = 'c1'): Chat => ({
  id,
  title: 't',
  engine: 'claude',
  model: null,
  mode: 'ask',
  repoId: null,
  repoName: null,
  repoPath: null,
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
  messages,
  session: null,
});

const noop = () => {};
const props = { engines: [], resolvingChangeSetId: null, onEdit: noop, onRetry: noop, onOpenChanges: noop, onResolveAll: noop };

function geometry(el: HTMLElement, g: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  for (const [key, value] of Object.entries(g)) Object.defineProperty(el, key, { value, configurable: true, writable: true });
}

beforeEach(() => document.documentElement.removeAttribute('data-motion'));
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-motion');
});

describe('scroll helpers', () => {
  it('is near the bottom within the threshold and not beyond it', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 450, clientHeight: 500 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 500 })).toBe(true);
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 500 })).toBe(false);
  });

  it('scrolls smoothly, or instantly when asked or when motion is reduced', () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: 900 });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as never;
    scrollToBottom(el, true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'smooth' });
    scrollToBottom(el, false);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
    document.documentElement.setAttribute('data-motion', 'reduced');
    scrollToBottom(el, true);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 900, behavior: 'auto' });
  });
});

describe('ChatThread', () => {
  it('is an announced log, busy only while a reply streams', () => {
    const { rerender } = render(<ChatThread chat={chat([m('u', 'user', 'hi'), m('a', 'assistant', 'yo')])} streaming={false} {...props} />);
    const log = screen.getByRole('log', { name: 'Conversation' });
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.getAttribute('aria-busy')).toBe('false');
    rerender(<ChatThread chat={chat([m('u', 'user', 'hi'), m('a', 'assistant', 'yo', { status: 'streaming' })])} streaming {...props} />);
    expect(screen.getByRole('log', { name: 'Conversation' }).getAttribute('aria-busy')).toBe('true');
  });

  it('renders user bubbles and assistant turns in order', () => {
    render(<ChatThread chat={chat([m('u1', 'user', 'first'), m('a1', 'assistant', 'second'), m('u2', 'user', 'third')])} streaming={false} {...props} />);
    const articles = screen.getAllByRole('article');
    expect(articles.map((a) => a.getAttribute('data-testid'))).toEqual(['chat-message-user', 'chat-message-assistant', 'chat-message-user']);
    expect(within(articles[0]!).getByText('first')).toBeTruthy();
    expect(within(articles[1]!).getByTestId('md').textContent).toBe('second');
  });

  it('offers Retry only on the last assistant turn, and Edit on user messages — neither while streaming', () => {
    const messages = [m('u1', 'user', 'q1'), m('a1', 'assistant', 'r1'), m('u2', 'user', 'q2'), m('a2', 'assistant', 'r2')];
    const { rerender } = render(<ChatThread chat={chat(messages)} streaming={false} {...props} />);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
    expect(within(screen.getAllByTestId('chat-message-assistant')[1]!).getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Edit message' })).toHaveLength(2);

    rerender(<ChatThread chat={chat([...messages.slice(0, 3), m('a2', 'assistant', 'r', { status: 'streaming' })])} streaming {...props} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull();
  });

  it('retry and edit report the message id', () => {
    const onRetry = vi.fn();
    const onEdit = vi.fn();
    render(<ChatThread chat={chat([m('u1', 'user', 'q'), m('a1', 'assistant', 'r')])} streaming={false} {...props} onRetry={onRetry} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('a1');
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const field = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(field, { target: { value: 'q, edited' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEdit).toHaveBeenCalledWith('u1', 'q, edited');
  });

  it('an unchanged or emptied edit sends nothing; Escape and Cancel leave the text alone', () => {
    const onEdit = vi.fn();
    render(<ChatThread chat={chat([m('u1', 'user', 'q')])} streaming={false} {...props} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit message' }), { key: 'Enter' });
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    const field = screen.getByRole('textbox', { name: 'Edit message' });
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit message' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Edit message' })).toBeNull();
    expect(screen.getByText('q')).toBeTruthy();
  });

  it('shows the thinking status for the whole live turn, and the text with a caret once it streams', () => {
    const { rerender } = render(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', '', { status: 'streaming' })])} streaming {...props} />);
    expect(screen.getByTestId('thinking-panel')).toBeTruthy();
    expect(screen.queryByTestId('chat-caret')).toBeNull();
    rerender(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'Hel', { status: 'streaming' })])} streaming {...props} />);
    expect(screen.getByTestId('thinking-panel')).toBeTruthy();
    expect(screen.getByTestId('chat-caret')).toBeTruthy();
    // A settled turn with no reasoning and no usage keeps the old, quiet look.
    rerender(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'Hello')])} streaming={false} {...props} />);
    expect(screen.queryByTestId('thinking-panel')).toBeNull();
  });

  it('shows what the agent did, an error, and a stopped note', () => {
    render(
      <ChatThread
        chat={chat([
          m('u', 'user', 'q'),
          m('a', 'assistant', 'partial', { activity: ['Edit src/a.ts', 'Ran pnpm test'], status: 'cancelled' }),
          m('b', 'assistant', '', { status: 'error', error: 'Claude Code exited with an error: boom' }),
        ])}
        streaming={false}
        {...props}
      />,
    );
    expect(within(screen.getByTestId('chat-activity')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Edit src/a.ts', 'Ran pnpm test']);
    expect(screen.getByTestId('chat-stopped').textContent).toBe('Stopped.');
    expect(screen.getByRole('alert').textContent).toContain('boom');
  });

  describe('docking the live turn', () => {
    const live = (text = 'live text') => chat([m('u', 'user', 'q'), m('a1', 'assistant', 'earlier', { status: 'done' }), m('u2', 'user', 'q2'), m('a', 'assistant', text, { status: 'streaming' })]);

    it('renders the live turn in the dock, not inline', () => {
      render(<ChatThread chat={live()} streaming {...props} />);
      const dock = screen.getByTestId('chat-dock');
      const thread = screen.getByTestId('chat-thread');
      expect(within(dock).getByTestId('thinking-panel')).toBeTruthy();
      expect(within(dock).getByText('live text')).toBeTruthy();
      expect(within(thread).queryByText('live text')).toBeNull();
      expect(thread.contains(dock)).toBe(false);
      // The finished turn keeps its inline record.
      expect(within(thread).getByText('earlier')).toBeTruthy();
    });

    it('never duplicates the live turn', () => {
      render(<ChatThread chat={live()} streaming {...props} />);
      expect(screen.getAllByText('live text')).toHaveLength(1);
      expect(screen.getAllByTestId('thinking-panel')).toHaveLength(1);
    });

    it('docks a streaming turn before any text arrives', () => {
      render(<ChatThread chat={live('')} streaming {...props} />);
      expect(within(screen.getByTestId('chat-dock')).getByTestId('thinking-panel')).toBeTruthy();
    });

    it('moves the turn inline and removes the dock once it finishes', () => {
      const { rerender } = render(<ChatThread chat={live()} streaming {...props} />);
      rerender(
        <ChatThread
          chat={chat([m('u', 'user', 'q'), m('a1', 'assistant', 'earlier'), m('u2', 'user', 'q2'), m('a', 'assistant', 'live text', { status: 'done' })])}
          streaming={false}
          {...props}
        />,
      );
      expect(screen.queryByTestId('chat-dock')).toBeNull();
      expect(within(screen.getByTestId('chat-thread')).getByText('live text')).toBeTruthy();
      expect(screen.getAllByText('live text')).toHaveLength(1);
    });

    it('has no dock when nothing is streaming, and shares the composer column', () => {
      render(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'r')])} streaming={false} {...props} />);
      expect(screen.queryByTestId('chat-dock')).toBeNull();
      const column = screen.getByTestId('chat-thread').firstElementChild!.firstElementChild!;
      expect(column.className).toContain('max-w-2xl');
      expect(screen.getByTestId('chat-thread').firstElementChild!.className).toContain('px-16');
    });
  });

  describe('scroll pinning', () => {
    it('shows "Jump to latest" once the reader scrolls away, and jumping smooth-scrolls to the end', () => {
      render(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'r')])} streaming={false} {...props} />);
      const log = screen.getByRole('log');
      const scrollTo = vi.fn();
      log.scrollTo = scrollTo as never;
      expect(screen.queryByTestId('chat-jump-latest')).toBeNull();

      geometry(log, { scrollHeight: 3000, clientHeight: 500, scrollTop: 100 });
      fireEvent.scroll(log);
      const jump = screen.getByTestId('chat-jump-latest');
      fireEvent.click(jump);

      expect(scrollTo).toHaveBeenLastCalledWith({ top: 3000, behavior: 'smooth' });
      expect(screen.queryByTestId('chat-jump-latest')).toBeNull();
    });

    it('does not show the button while the reader is at the bottom', () => {
      render(<ChatThread chat={chat([m('u', 'user', 'q')])} streaming={false} {...props} />);
      const log = screen.getByRole('log');
      geometry(log, { scrollHeight: 1000, clientHeight: 500, scrollTop: 480 });
      fireEvent.scroll(log);
      expect(screen.queryByTestId('chat-jump-latest')).toBeNull();
    });

    it('follows streamed text instantly while pinned, and stops following once the reader scrolls up', () => {
      const messages = (text: string) => [m('u', 'user', 'q'), m('a', 'assistant', text, { status: 'streaming' })];
      const { rerender } = render(<ChatThread chat={chat(messages('a'))} streaming {...props} />);
      const log = screen.getByRole('log');
      const scrollTo = vi.fn();
      log.scrollTo = scrollTo as never;
      geometry(log, { scrollHeight: 1200, clientHeight: 500, scrollTop: 700 });

      rerender(<ChatThread chat={chat(messages('ab'))} streaming {...props} />);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'auto' });

      geometry(log, { scrollHeight: 1200, clientHeight: 500, scrollTop: 0 });
      fireEvent.scroll(log);
      scrollTo.mockClear();
      rerender(<ChatThread chat={chat(messages('abc'))} streaming {...props} />);
      expect(scrollTo).not.toHaveBeenCalled();
    });

    it('a message the user sends always brings the view back to the bottom, smoothly', () => {
      const { rerender } = render(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'r')])} streaming={false} {...props} />);
      const log = screen.getByRole('log');
      const scrollTo = vi.fn();
      log.scrollTo = scrollTo as never;
      geometry(log, { scrollHeight: 2000, clientHeight: 500, scrollTop: 0 });
      fireEvent.scroll(log);

      rerender(<ChatThread chat={chat([m('u', 'user', 'q'), m('a', 'assistant', 'r'), m('u2', 'user', 'again')])} streaming={false} {...props} />);
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 2000, behavior: 'smooth' });
    });

    it('opening a different chat jumps to its end without gliding', () => {
      const { rerender } = render(<ChatThread chat={chat([m('u', 'user', 'q')], 'one')} streaming={false} {...props} />);
      const log = screen.getByRole('log');
      const scrollTo = vi.fn();
      log.scrollTo = scrollTo as never;
      geometry(log, { scrollHeight: 800, clientHeight: 500, scrollTop: 0 });
      act(() => {
        rerender(<ChatThread chat={chat([m('u', 'user', 'other')], 'two')} streaming={false} {...props} />);
      });
      expect(scrollTo).toHaveBeenLastCalledWith({ top: 800, behavior: 'auto' });
    });
  });
});
