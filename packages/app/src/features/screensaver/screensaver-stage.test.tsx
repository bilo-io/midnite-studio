import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreensaverStage } from './screensaver-stage';

// The spinner asks the platform about reduced motion on mount, and jsdom
// ships no `matchMedia` — same workaround `landing-view.test.tsx` uses.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const counts = { repos: 3, agents: 0, myPrs: 5, teamPrs: 2 };

describe('ScreensaverStage pills (Phase 46 Theme C)', () => {
  it('renders every pill as a real button, keyboard-reachable', () => {
    render(<ScreensaverStage mode="idle" counts={counts} />);
    for (const name of ['3 repos', '0 agents', '5 my PRs', '2 team PRs']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeTruthy();
    }
  });

  it('a zero-count pill still navigates — an empty destination beats a disabled control', () => {
    const onPillClick = vi.fn();
    render(<ScreensaverStage mode="idle" counts={counts} onPillClick={onPillClick} />);
    fireEvent.click(screen.getByRole('button', { name: /^0 agents/ }));
    expect(onPillClick).toHaveBeenCalledWith('agents');
  });

  it('names the destination in the accessible name, not just the count', () => {
    render(<ScreensaverStage mode="idle" counts={counts} />);
    expect(screen.getByRole('button', { name: '3 repos — open the repositories panel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '0 agents — reveal the terminal' })).toBeTruthy();
  });

  it("a pill click does not bubble to an ancestor's click handler", () => {
    const ancestorClick = vi.fn();
    render(
      <div onClick={ancestorClick}>
        <ScreensaverStage mode="idle" counts={counts} onPillClick={() => {}} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /^3 repos/ }));
    expect(ancestorClick).not.toHaveBeenCalled();
  });
});
