// vitest/jsdom: DOM text over a mock bridge.
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatTokens, TokenSpendSection } from './token-spend-section';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

const t = (input: number, output: number) => ({ input, output, cacheRead: 2000, cacheCreate: 0 });

describe('TokenSpendSection', () => {
  it('shows a per-agent roll-up and per-session rows', async () => {
    const monitorAgentUsage = vi.fn().mockResolvedValue({
      sessions: [
        { sessionId: 's1', agentId: 'claude', title: 'API', totals: { ...t(1500, 300), model: 'claude-x' } },
        { sessionId: 's2', agentId: 'claude', title: 'Web', totals: null },
      ],
      agents: [{ agentId: 'claude', sessions: 2, totals: t(1500, 300) }],
    });
    window.midniteStudio = { monitorAgentUsage } as unknown as typeof window.midniteStudio;
    render(<TokenSpendSection />);
    const agents = await screen.findByLabelText('Tokens per agent');
    expect(within(agents).getByText(/in 1.5k · out 300 · cache read 2k/)).toBeTruthy();
    expect(within(screen.getByLabelText('Tokens per session')).getByText('no transcript found')).toBeTruthy();
  });

  it('says so when there is no channel', async () => {
    window.midniteStudio = {} as unknown as typeof window.midniteStudio;
    render(<TokenSpendSection />);
    expect(await screen.findByText('No live agent sessions.')).toBeTruthy();
  });

  it('formats counts', () => {
    expect([999, 1000, 12_340, 2_500_000].map(formatTokens)).toEqual(['999', '1k', '12.3k', '2.5M']);
  });
});
