import { describe, expect, it, vi } from 'vitest';

import { applyPillDestination } from './pill-destinations';

function actions() {
  return {
    setActiveView: vi.fn(),
    setReposOpen: vi.fn(),
    setTerminalOpen: vi.fn(),
  };
}

describe('applyPillDestination', () => {
  it('repos reveals the repos panel, not a routed view', () => {
    const a = actions();
    applyPillDestination('repos', a);
    expect(a.setReposOpen).toHaveBeenCalledWith(true);
    expect(a.setActiveView).not.toHaveBeenCalled();
  });

  it('agents reveals the terminal panel', () => {
    const a = actions();
    applyPillDestination('agents', a);
    expect(a.setTerminalOpen).toHaveBeenCalledWith(true);
    expect(a.setActiveView).not.toHaveBeenCalled();
  });

  it('myPrs and teamPrs both navigate to reviews', () => {
    const a = actions();
    applyPillDestination('myPrs', a);
    applyPillDestination('teamPrs', a);
    expect(a.setActiveView).toHaveBeenNthCalledWith(1, 'reviews');
    expect(a.setActiveView).toHaveBeenNthCalledWith(2, 'reviews');
  });
});
