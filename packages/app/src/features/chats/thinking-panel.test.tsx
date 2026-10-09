import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ChatMessage } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import { formatElapsed, formatTokens, ThinkingPanel } from './thinking-panel';

// vitest/jsdom: the panel's states, toggle and which metrics it shows — DOM roles and text only.

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a',
  role: 'assistant',
  text: '',
  createdAt: 1_000,
  status: 'done',
  ...over,
});

describe('ThinkingPanel', () => {
  afterEach(cleanup);

  it('is collapsed by default with the ring on the pill only, and toggles the reasoning open', () => {
    render(<ThinkingPanel message={msg({ status: 'streaming', thinking: 'Let me look at the tests first.' })} />);
    const toggle = screen.getByTestId('thinking-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.className).toContain('thinking-ring');
    expect(screen.getByTestId('thinking-panel').className).not.toContain('thinking-ring');
    expect(screen.queryByTestId('thinking-body')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Expanded, the ring moves from the pill to the whole panel.
    expect(toggle.className).not.toContain('thinking-ring');
    expect(screen.getByTestId('thinking-panel').className).toContain('thinking-ring');
    expect(screen.getByTestId('thinking-body').textContent).toBe('Let me look at the tests first.');

    fireEvent.click(toggle);
    expect(screen.queryByTestId('thinking-body')).toBeNull();
  });

  it('shows a cycling verb and a live ring while streaming', () => {
    render(<ThinkingPanel message={msg({ status: 'streaming' })} />);
    expect(screen.getByTestId('thinking-label').textContent).toMatch(/^[A-Z][a-z]+ing…$/);
    expect(screen.getByTestId('thinking-pill').getAttribute('data-live')).toBe('true');
    // Nothing to expand without reasoning.
    expect(screen.queryByTestId('thinking-toggle')).toBeNull();
  });

  it('says how long it thought once the turn is done, and stops the ring', () => {
    render(<ThinkingPanel message={msg({ thinking: 'hmm', thinkingMs: 12_400, finishedAt: 31_000 })} />);
    expect(screen.getByTestId('thinking-label').textContent).toBe('Thought for 12s');
    expect(screen.getByTestId('thinking-toggle').getAttribute('data-live')).toBe('false');
    expect(screen.getByTestId('thinking-elapsed').textContent).toBe('30s');
  });

  it('shows tokens and the context ring only when reported', () => {
    const { rerender } = render(
      <ThinkingPanel message={msg({ finishedAt: 5_000, usage: { outputTokens: 1_234, contextTokens: 50_000, contextWindow: 200_000 } })} />,
    );
    expect(screen.getByTestId('thinking-tokens').textContent).toBe('1.2k tokens');
    expect(screen.getByRole('img', { name: '50k of 200k context tokens used' }).textContent).toBe('25%');

    rerender(<ThinkingPanel message={msg({ finishedAt: 5_000, usage: { outputTokens: 80 } })} />);
    expect(screen.getByTestId('thinking-tokens').textContent).toBe('80 tokens');
    expect(screen.queryByTestId('thinking-context')).toBeNull();
  });

  it('renders nothing for a settled turn with no reasoning and no usage', () => {
    const { container } = render(<ThinkingPanel message={msg({ text: 'hi', finishedAt: 2_000 })} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('formatters', () => {
  it('formats elapsed time and token counts compactly', () => {
    expect(formatElapsed(400)).toBe('0s');
    expect(formatElapsed(59_400)).toBe('59s');
    expect(formatElapsed(65_000)).toBe('1m 05s');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(1_000)).toBe('1k');
    expect(formatTokens(12_345)).toBe('12k');
    expect(formatTokens(1_500_000)).toBe('1.5M');
  });
});
