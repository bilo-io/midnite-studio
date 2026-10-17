// vitest/jsdom: what an app with an empty host (Gamer today) gets — plain chrome, no agents, no Timeline.
import type { GameSummary } from '@midnite/studio-shared';
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Popover, useGameOccluded } from './chrome';
import { GameCreatePanel } from './game-create-panel';
import { GameDetailPanel } from './game-detail-panel';
import { GameHostProvider } from './host';

afterEach(cleanup);

const BROKEN: GameSummary = {
  gameId: 'g000000000001',
  name: 'Moon Rover',
  path: '/Games/moon-rover',
  engine: 'phaser',
  dimension: '2d',
  starter: 'top-down',
  dirty: false,
  valid: false,
  issue: 'name is required',
};

function Shell({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <FrameChromeProvider chrome={createFrameChrome().chrome}>{children}</FrameChromeProvider>
    </QueryClientProvider>
  );
}

describe('the Game feature with an empty host', () => {
  it('offers no first prompt on the create form — there is no agent to give it to', () => {
    render(
      <Shell>
        <GameCreatePanel onCreated={() => undefined} />
      </Shell>,
    );
    expect(screen.getByRole('heading', { name: 'New game' })).toBeTruthy();
    expect(screen.queryByLabelText('First prompt')).toBeNull();
  });

  it('shows a selected game without a Timeline button or an agent panel', () => {
    render(
      <Shell>
        <GameDetailPanel game={BROKEN} />
      </Shell>,
    );
    expect(screen.getByRole('alert').textContent).toContain('name is required');
    expect(screen.queryByRole('button', { name: /Open in Timeline/ })).toBeNull();
  });

  it('offers the Timeline button when the host has one, and calls it with the game', () => {
    const openInTimeline = vi.fn();
    render(
      <Shell>
        <GameHostProvider host={{ openInTimeline }}>
          <GameDetailPanel game={BROKEN} />
        </GameHostProvider>
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Open in Timeline/ }));
    expect(openInTimeline).toHaveBeenCalledWith(BROKEN);
  });

  it('its plain popover opens, counts as an occluder while open, and closes on Escape', () => {
    function Probe() {
      return (
        <>
          <Popover label="Menu" trigger={<span>m</span>}>
            <p>panel</p>
          </Popover>
          <output data-testid="occluded">{String(useGameOccluded())}</output>
        </>
      );
    }
    render(<Probe />);
    expect(screen.getByTestId('occluded').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('panel')).toBeTruthy();
    expect(screen.getByTestId('occluded').textContent).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('panel')).toBeNull();
    expect(screen.getByTestId('occluded').textContent).toBe('false');
  });
});
