import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChecksArt, KanbanArt, WindowArt } from './illustrations';

/**
 * The reduced-motion switch, stubbed at the media query rather than passed in.
 *
 * These three take no `reduced` prop — they are rendered by `SERVICE_ROWS` as
 * bare components, and giving them one purely so a test could reach it would
 * put a test-only seam in a public API for no other reason.
 */
const setReducedMotion = (reduced: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: reduced && query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
};

afterEach(() => vi.unstubAllGlobals());

/** Everything animated carries a class; the still frame carries none of them. */
const animatedClasses = (root: Element) =>
  [...root.querySelectorAll('[class]')]
    .flatMap((node) => node.getAttribute('class')?.split(/\s+/) ?? [])
    .filter((name) => name.startsWith('ws-'));

describe('<KanbanArt>', () => {
  it('draws every stage of a card, so the loop has all three to cross-fade', () => {
    setReducedMotion(false);
    render(<KanbanArt />);

    // Todo, In progress and Done are three stacked borders on one card rather
    // than three cards: the card is the thing that moves, and a state that had
    // its own card could end up in the wrong column.
    expect(screen.getByTestId('kanban-todo')).toBeTruthy();
    expect(screen.getByTestId('kanban-doing')).toBeTruthy();
    expect(screen.getByTestId('kanban-done')).toBeTruthy();
    expect(screen.getByTestId('kanban-check')).toBeTruthy();
    expect(screen.getByTestId('kanban-terminal')).toBeTruthy();
  });

  it('signals "an agent has this" with the site`s ramp and its neon glow', () => {
    setReducedMotion(false);
    render(<KanbanArt />);

    const doing = screen.getByTestId('kanban-doing');
    expect(doing.getAttribute('stroke')).toContain('url(#ws-kanban-ramp)');
    // `.ws-svg-neon` is the `.ws-neon` mechanism painted as a filter, since a
    // box-shadow does not apply to an SVG shape.
    expect(doing.getAttribute('class')).toContain('ws-svg-neon');

    const stops = [...screen.getByTestId('kanban-art').querySelectorAll('stop')].map((stop) =>
      stop.getAttribute('stop-color'),
    );
    for (const index of [0, 1, 2, 3, 4, 5]) {
      expect(stops, `ramp stop ${index}`).toContain(`var(--ws-rainbow-${index})`);
    }
  });

  it('marks Done in emerald with a tick, not in the accent', () => {
    setReducedMotion(false);
    render(<KanbanArt />);
    expect(screen.getByTestId('kanban-done').getAttribute('stroke')).toBe('var(--ws-lane-2)');
    expect(screen.getByTestId('kanban-check').querySelector('path')).not.toBeNull();
  });

  it('rests on the finished frame under reduced motion, with nothing animated', () => {
    setReducedMotion(true);
    render(<KanbanArt />);

    const art = screen.getByTestId('kanban-art');
    expect(art.dataset.animated).toBe('false');
    expect(animatedClasses(art)).toHaveLength(0);

    // The card is in Done, green and ticked — the end of the sequence, not a
    // frozen middle of it.
    expect(screen.getByTestId('kanban-card').getAttribute('transform')).toBe('translate(208 0)');
    expect(screen.getByTestId('kanban-done').getAttribute('opacity')).toBe('1');
    expect(screen.getByTestId('kanban-check').getAttribute('opacity')).toBe('1');
    expect(screen.getByTestId('kanban-todo').getAttribute('opacity')).toBe('0');
    expect(screen.getByTestId('kanban-doing').getAttribute('opacity')).toBe('0');
  });
});

describe('<ChecksArt>', () => {
  it('gives every check a running and a passed state, and one a failure', () => {
    setReducedMotion(false);
    render(<ChecksArt />);

    expect(screen.getAllByTestId('checks-running')).toHaveLength(3);
    expect(screen.getAllByTestId('checks-passed')).toHaveLength(3);
    // Exactly one failure: a red check is an ordinary event the row is about,
    // and three of them would be a broken build rather than a story.
    expect(screen.getAllByTestId('checks-failing')).toHaveLength(1);
  });

  it('lands a new commit, which is what clears the failure', () => {
    setReducedMotion(false);
    render(<ChecksArt />);
    expect(screen.getByTestId('checks-new-commit')).toBeTruthy();
  });

  it('flips the review badge from changes requested to approved', () => {
    setReducedMotion(false);
    render(<ChecksArt />);
    expect(screen.getByTestId('checks-changes').getAttribute('fill')).toBe('var(--ws-lane-4)');
    expect(screen.getByTestId('checks-approved').getAttribute('fill')).toBe('var(--ws-lane-2)');
  });

  it('settles on every check green and the review approved, under reduced motion', () => {
    setReducedMotion(true);
    render(<ChecksArt />);

    const art = screen.getByTestId('checks-art');
    expect(art.dataset.animated).toBe('false');
    expect(animatedClasses(art)).toHaveLength(0);

    for (const passed of screen.getAllByTestId('checks-passed')) {
      expect(passed.getAttribute('opacity')).toBe('1');
    }
    for (const running of screen.getAllByTestId('checks-running')) {
      expect(running.getAttribute('opacity')).toBe('0');
    }
    expect(screen.getByTestId('checks-failing').getAttribute('opacity')).toBe('0');
    expect(screen.getByTestId('checks-approved').getAttribute('opacity')).toBe('1');
    expect(screen.getByTestId('checks-changes').getAttribute('opacity')).toBe('0');
  });
});

describe('<WindowArt>', () => {
  it('draws its lanes from a normalised path length, staggered', () => {
    setReducedMotion(false);
    render(<WindowArt />);

    const lanes = [...screen.getByTestId('window-lanes').querySelectorAll('path')];
    expect(lanes).toHaveLength(3);
    for (const lane of lanes) {
      // `pathLength="1"` is what lets one dash length draw any of them.
      expect(lane.getAttribute('pathLength')).toBe('1');
      expect(lane.getAttribute('class')).toContain('ws-win-draw');
    }
    const delays = lanes.map((lane) => (lane as SVGElement).style.animationDelay);
    expect(new Set(delays).size).toBe(3);
  });

  it('has one cue per pane: a lane, a prompt, a tab and a status', () => {
    setReducedMotion(false);
    render(<WindowArt />);
    expect(screen.getByTestId('window-prompt').getAttribute('class')).toContain('ws-win-type');
    expect(screen.getByTestId('window-tab').getAttribute('class')).toContain('ws-win-tab');
    expect(screen.getByTestId('window-status-ok').getAttribute('class')).toContain('ws-win-ok');
  });

  it('shows every pane already lit under reduced motion', () => {
    setReducedMotion(true);
    render(<WindowArt />);

    const art = screen.getByTestId('window-art');
    expect(art.dataset.animated).toBe('false');
    expect(animatedClasses(art)).toHaveLength(0);
    expect(screen.getByTestId('window-tab').getAttribute('opacity')).toBe('1');
    expect(screen.getByTestId('window-status-ok').getAttribute('opacity')).toBe('1');
  });
});
