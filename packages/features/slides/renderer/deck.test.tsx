// vitest/jsdom: what an app with an empty host (Creator) gets — Escape to close, plain links, unhighlighted code.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Deck } from './deck';
import { parseDeck } from './deck-parser';
import { SlidesHostProvider, type SlidesHost } from './host';

const DECK = parseDeck(
  ['# Intro', '', 'first', '', '---', '', '# Two', '', '[the docs](https://example.com/docs)', '', '```ts', 'const a = 1;', '```'].join('\n'),
);

function renderDeck(host: SlidesHost = {}, onClose = vi.fn()) {
  render(
    <SlidesHostProvider host={host}>
      <Deck deck={DECK} onClose={onClose} />
    </SlidesHostProvider>,
  );
  return onClose;
}

afterEach(cleanup);

describe('Deck with an empty host', () => {
  it('closes on Escape — help first, then the deck', async () => {
    const onClose = renderDeck();
    fireEvent.keyDown(window, { key: '?' });
    await screen.findByRole('dialog', { name: 'Presentation shortcuts' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Presentation shortcuts' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders a markdown link as a plain anchor that leaves in a new window', async () => {
    renderDeck();
    // End: the last slide, fully revealed.
    fireEvent.keyDown(window, { key: 'End' });
    const link = await screen.findByRole('link', { name: 'the docs' });
    expect(link.getAttribute('href')).toBe('https://example.com/docs');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows a fenced block as plain text when the host has no highlighter', async () => {
    renderDeck();
    fireEvent.keyDown(window, { key: 'End' });
    expect(await screen.findByText('const a = 1;')).toBeDefined();
  });

  it('uses the host highlighter when it has one', async () => {
    const highlight = vi.fn().mockResolvedValue('<pre class="shiki"><code>HIGHLIGHTED</code></pre>');
    renderDeck({ highlight, useIsDark: () => true });
    fireEvent.keyDown(window, { key: 'End' });
    expect(await screen.findByText('HIGHLIGHTED')).toBeDefined();
    expect(highlight).toHaveBeenCalledWith('const a = 1;', 'ts', true);
  });

  it('lets the host own dismissal: the empty-host Escape listener is not installed', () => {
    const useDismiss = vi.fn();
    const onClose = renderDeck({ useDismiss });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    expect(useDismiss).toHaveBeenCalled();
  });
});
