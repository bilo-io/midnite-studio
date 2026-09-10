import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MockFixtures } from '../../../test-support/mock-bridge';
import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { SessionsView } from './sessions-view';

/**
 * Migrated from `e2e/sessions-view.spec.ts` (Phase 82 Theme C, wave 5) — the
 * provider filter's trigger label, narrowing the rendered list, the
 * multiselect staying open across a second pick, clearing back to "All
 * providers", and the AND-combination with the endings facet producing the
 * empty state rather than an error. All 3 of the original tests moved here.
 *
 * `SessionsView` has no `React.lazy` boundary of its own — only the outer
 * view-registry lazy-loads the *view*, bypassed by mounting the component
 * directly — so no chunk warm-up is needed, the same conclusion reached for
 * `OptimizerPage`/`ActionsView`.
 */

const closedSession = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  kind: 'shell',
  title: 'midnite-studio',
  cwd: '/tmp/midnite-studio',
  repoId: 'repo-1',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_100_000,
  exitCode: null,
  reason: 'closed',
  transcriptBytes: 128,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  closedSessions: [
    closedSession({
      id: 'claude-1',
      kind: 'agent',
      agentId: 'claude',
      name: 'claude-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_300_000,
    }),
    closedSession({
      id: 'codex-1',
      kind: 'agent',
      agentId: 'codex',
      name: 'codex-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_200_000,
    }),
    closedSession({
      id: 'terminal-1',
      kind: 'shell',
      name: 'terminal-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_100_000,
    }),
  ],
};

const list = () => screen.getByRole('list', { name: 'Closed sessions' });

async function openSessions(data: MockFixtures = base): Promise<void> {
  renderView(<SessionsView />, { fixtures: data });
  await screen.findByRole('list', { name: 'Closed sessions' });
}

afterEach(cleanup);

describe('SessionsView, assembled through the real bridge', () => {
  it('the provider filter trigger reads "All providers" until something is picked', async () => {
    await openSessions();

    expect(within(list()).getByText('claude-run')).toBeTruthy();
    expect(within(list()).getByText('codex-run')).toBeTruthy();
    expect(within(list()).getByText('terminal-run')).toBeTruthy();

    expect(screen.getByRole('button', { name: 'All providers' })).toBeTruthy();
  });

  it('picking a provider narrows the list, and clearing it restores every row', async () => {
    await openSessions();

    fireEvent.click(screen.getByRole('button', { name: 'All providers' }));
    fireEvent.click(screen.getByRole('option', { name: /Claude/ }));

    expect(within(list()).getByText('claude-run')).toBeTruthy();
    expect(within(list()).queryByText('codex-run')).toBeNull();
    expect(within(list()).queryByText('terminal-run')).toBeNull();
    // A single selection shows the provider's own name, not a summary count.
    expect(screen.getByRole('button', { name: 'Claude' })).toBeTruthy();

    // Add Terminal alongside Claude — the menu stays open across a selection
    // (it is a multiselect, not a one-shot picker), so the next option is
    // clicked directly rather than reopening the trigger.
    // A regex, not the exact string: the option's accessible name also
    // includes the trailing count adornment (Testing Library matches the
    // whole accessible name by default, unlike Playwright's substring
    // default).
    fireEvent.click(screen.getByRole('option', { name: /^Terminal/ }));

    expect(within(list()).getByText('claude-run')).toBeTruthy();
    expect(within(list()).getByText('terminal-run')).toBeTruthy();
    expect(within(list()).queryByText('codex-run')).toBeNull();
    expect(screen.getByRole('button', { name: '2 providers' })).toBeTruthy();

    // Back to "All providers" clears the facet entirely — still the same open
    // menu, so the special "All providers" row is clicked directly.
    fireEvent.click(screen.getByRole('option', { name: 'All providers' }));

    expect(within(list()).getByText('claude-run')).toBeTruthy();
    expect(within(list()).getByText('codex-run')).toBeTruthy();
    expect(within(list()).getByText('terminal-run')).toBeTruthy();
  });

  it('a provider filter that excludes every session shows the empty state, not an error', async () => {
    // Every session in `base` closed with reason "closed" — combining the
    // provider facet with an ending no row has proves the two facets AND
    // together, and that an empty intersection renders the same empty state
    // as no history at all rather than an error.
    await openSessions();

    fireEvent.click(screen.getByRole('button', { name: 'All providers' }));
    fireEvent.click(screen.getByRole('option', { name: /Claude/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'All endings' }));
    fireEvent.click(screen.getByRole('option', { name: 'Exited' }));

    expect(await screen.findByText('No closed sessions')).toBeTruthy();
  });
});
