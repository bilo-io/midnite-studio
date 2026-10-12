/**
 * Vitest/jsdom: the companion thread's follow-the-newest-turn rule. No browser
 * capability needed — jsdom has no layout, so the scroll container's
 * geometry is set by hand and the "Jump to latest" chip (shown exactly while
 * the thread is not pinned to the bottom) is what the assertions read.
 */
import type { CompanionTurn } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CompanionThread } from './companion-thread';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: StubResizeObserver,
    });
  }
  for (const prop of ['clientHeight', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 600 });
  }
  for (const prop of ['clientWidth', 'offsetWidth'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => 360 });
  }
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({
      width: 360,
      height: 600,
      top: 0,
      left: 0,
      right: 360,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
});

afterEach(cleanup);

const turn = (index: number, role: CompanionTurn['role']): CompanionTurn => ({
  id: `t${index}`,
  role,
  text: `turn ${index}`,
  at: 1_790_000_000_000 + index * 1000,
  spoken: false,
});

const history = [turn(0, 'companion'), turn(1, 'user'), turn(2, 'companion')];

/** Give the scroll container a height and put the view `fromBottom` px above the end. */
function scrollUp(el: HTMLElement, fromBottom: number): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => 1000 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 200 });
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 1000 - 200 - fromBottom });
  fireEvent.scroll(el);
}

describe('CompanionThread scrolling', () => {
  it('leaves a reader who scrolled up where they are when the companion adds a turn', () => {
    const { rerender } = render(<CompanionThread turns={history} />);
    const el = screen.getByTestId('companion-thread');
    scrollUp(el, 500);
    expect(screen.getByTestId('companion-jump-latest')).toBeTruthy();

    rerender(<CompanionThread turns={[...history, turn(3, 'companion')]} />);
    expect(screen.getByTestId('companion-jump-latest')).toBeTruthy();
    expect(el.scrollTop).toBe(300);
  });

  it('brings the view back to the bottom for a turn the user just said', () => {
    const { rerender } = render(<CompanionThread turns={history} />);
    const el = screen.getByTestId('companion-thread');
    scrollUp(el, 500);
    expect(screen.getByTestId('companion-jump-latest')).toBeTruthy();

    rerender(<CompanionThread turns={[...history, turn(3, 'user')]} />);
    expect(screen.queryByTestId('companion-jump-latest')).toBeNull();
    // Followed to the true bottom, not the estimated end of the last row.
    expect(el.scrollTop).toBe(1000);
  });

  it('does not re-pin on a re-render that adds nothing, even if the last turn is the user’s', () => {
    const own = [...history, turn(3, 'user')];
    const { rerender } = render(<CompanionThread turns={own} />);
    const el = screen.getByTestId('companion-thread');
    scrollUp(el, 500);

    rerender(<CompanionThread turns={[...own]} />);
    expect(screen.getByTestId('companion-jump-latest')).toBeTruthy();
  });
});

describe('CompanionThread avatars', () => {
  it('renders companion avatar for companion turns and user avatar for user turns', () => {
    render(<CompanionThread turns={history} />);
    const thread = screen.getByTestId('companion-thread');

    const agentAvatars = thread.querySelectorAll('[data-testid="companion-agent-avatar"]');
    expect(agentAvatars).toHaveLength(2); // turn 0 and turn 2 are companion

    const userAvatars = thread.querySelectorAll('[data-testid="companion-user-avatar"]');
    expect(userAvatars).toHaveLength(1); // turn 1 is user
  });

  it('renders agent avatar for agent output turns', () => {
    const turnsWithAgent: CompanionTurn[] = [
      turn(0, 'companion'),
      turn(1, 'agent'),
    ];
    render(<CompanionThread turns={turnsWithAgent} />);
    const thread = screen.getByTestId('companion-thread');

    const agentAvatars = thread.querySelectorAll('[data-testid="companion-agent-avatar"]');
    expect(agentAvatars).toHaveLength(2); // both companion and agent turns have agent/companion avatars
  });
});

