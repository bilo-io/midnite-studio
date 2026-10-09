import { cleanup, configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONVERSATION_FORGE,
  CONVERSATION_PR_NUMBER,
} from '../../../test-support/conversation-fixtures';
import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { PrDetail } from './pr-detail';

/**
 * Clicking a thread's path on the Conversation tab opens that file on the Files
 * tab: switches tab, expands the file's accordion (the fourth-and-later files
 * are closed by default) and scrolls it into view. vitest/jsdom — no real
 * layout needed, `scrollIntoView` is stubbed as jsdom has none.
 */

configure({ asyncUtilTimeout: 5000 });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const data = { ...fixtures, forge: CONVERSATION_FORGE } as MockFixtures;

async function openConversation(): Promise<void> {
  renderView(
    <ToastHost>
      <PrDetail repoId="repo-1" number={CONVERSATION_PR_NUMBER} />
    </ToastHost>,
    { fixtures: data },
  );
  await screen.findByRole('region', { name: `Pull request #${CONVERSATION_PR_NUMBER}` });
  fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));
  await screen.findAllByTestId('conversation-thread');
}

describe('mock conversation fixture', () => {
  it('nests two threads under the review and keeps the rest outside it', async () => {
    await openConversation();
    const cards = screen.getAllByTestId('conversation-thread');
    expect(cards).toHaveLength(5);
    expect(cards.filter((c) => c.getAttribute('data-resolved') === 'true')).toHaveLength(1);
    expect(screen.getAllByTestId('hunk-excerpt').length).toBeGreaterThanOrEqual(4);
  });
});

describe('thread path opens its file', () => {
  it('expands a closed file, scrolls to it, and works again on a re-click', async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    await openConversation();

    // gamma.ts is the 4th file — closed by default.
    const gamma = screen.getByRole('button', { name: 'src/lib/gamma.ts' });
    fireEvent.click(gamma);

    const filesTab = await screen.findByRole('tab', { name: 'Files', selected: true });
    expect(filesTab).toBeTruthy();
    const header = await screen.findByRole('button', { name: /gamma\.ts/ });
    await waitFor(() => expect(header.getAttribute('aria-expanded')).toBe('true'));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1));

    // Back and again: the request was cleared, so the same path still works.
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));
    await screen.findAllByTestId('conversation-thread');
    fireEvent.click(screen.getByRole('button', { name: 'src/lib/gamma.ts' }));
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  });

  it('leaves the default first-three-open rule alone without a request', async () => {
    renderView(
      <ToastHost>
        <PrDetail repoId="repo-1" number={CONVERSATION_PR_NUMBER} />
      </ToastHost>,
      { fixtures: data },
    );
    await screen.findByRole('region', { name: `Pull request #${CONVERSATION_PR_NUMBER}` });
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const far = await screen.findByRole('button', { name: /zeta\.ts/ });
    expect(far.getAttribute('aria-expanded')).toBe('false');
    expect(within(document.body).getByRole('button', { name: /retry\.ts/ }).getAttribute('aria-expanded')).toBe('true');
  });
});
