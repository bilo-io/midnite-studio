import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Showcase } from './showcase';

describe('<Showcase>', () => {
  it('draws one node per commit row and one edge per parent link', () => {
    render(<Showcase reduced />);
    const graph = screen.getByTestId('showcase-graph');

    // Nine commits, nine nodes — a row is a commit and a lane is the branch it
    // was reached on, so two nodes on a row would picture something the app
    // never shows. Eight parent links, one of which is the merge's second.
    expect(graph.querySelectorAll('circle')).toHaveLength(9);
    expect(graph.querySelectorAll('path')).toHaveLength(9);
  });

  it('badges the checked-out tip and highlights its row', () => {
    render(<Showcase reduced />);
    expect(screen.getByTestId('showcase-tip-badge')).toBeTruthy();

    const highlight = screen
      .getByTestId('showcase-graph')
      .querySelector('[fill="var(--ws-accent-soft)"]');
    expect(highlight).not.toBeNull();
  });

  it('uses all four lane colours', () => {
    render(<Showcase reduced />);
    const strokes = Array.from(
      screen.getByTestId('showcase-graph').querySelectorAll('[stroke]'),
    ).map((node) => node.getAttribute('stroke'));
    for (const lane of [1, 2, 3, 4]) {
      expect(strokes, `lane ${lane}`).toContain(`var(--ws-lane-${lane})`);
    }
  });

  /*
    SMIL is the half of the motion policy CSS cannot reach — zeroing a duration
    token does nothing to an `<animate>` — so the pulse has to be absent rather
    than slowed.
  */
  it('withholds the pulse under reduced motion, and runs it otherwise', () => {
    const { unmount } = render(<Showcase reduced />);
    expect(screen.queryByTestId('showcase-pulse')).toBeNull();
    unmount();

    render(<Showcase reduced={false} />);
    const pulse = screen.getByTestId('showcase-pulse');
    expect(pulse.querySelectorAll('animate')).toHaveLength(2);
  });
});
