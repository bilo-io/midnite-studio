import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Showcase } from './showcase';

/** The still frame's one copy — the shape the data actually declares. */
const stillGraph = () => {
  render(<Showcase reduced />);
  return screen.getByTestId('showcase-graph');
};

describe('<Showcase>', () => {
  it('draws twenty commits, one node each, and one edge per parent link', () => {
    const graph = stillGraph();

    // Twenty commits, twenty nodes — a row is a commit and a lane is the branch
    // it was reached on, so two nodes on a row would picture something the app
    // never shows. Twenty-one parent links (two commits have two parents), plus
    // the root's stub, which is what joins one copy of the list to the next.
    expect(graph.querySelectorAll('circle')).toHaveLength(20);
    expect(graph.querySelectorAll('path')).toHaveLength(22);
    expect(graph.querySelectorAll('[data-testid="showcase-root-stub"]')).toHaveLength(1);
  });

  it('has exactly two merges, and fills them', () => {
    const graph = stillGraph();

    // A merge is the one node with two parents, and the only one drawn filled
    // in its own lane colour — every other node is hollow on the card's
    // background. Counting filled nodes is therefore counting merges.
    const filled = [...graph.querySelectorAll('circle')].filter((node) =>
      node.getAttribute('fill')?.startsWith('var(--ws-lane-'),
    );
    expect(filled).toHaveLength(2);
  });

  it('badges the checked-out tip, two open branches and a tag', () => {
    const graph = stillGraph();
    expect(graph.querySelectorAll('[data-testid="showcase-badge-head"]')).toHaveLength(1);
    expect(graph.querySelectorAll('[data-testid="showcase-badge-branch"]')).toHaveLength(2);
    expect(graph.querySelectorAll('[data-testid="showcase-badge-tag"]')).toHaveLength(1);
  });

  it('highlights the checked-out row', () => {
    render(<Showcase reduced />);
    const head = screen.getByTestId('showcase-head');
    expect(head.getAttribute('fill')).toBe('var(--ws-accent-soft)');
  });

  it('uses all five lane colours', () => {
    const graph = stillGraph();
    const strokes = [...graph.querySelectorAll('[stroke]')].map((node) =>
      node.getAttribute('stroke'),
    );
    for (const lane of [1, 2, 3, 4, 5]) {
      expect(strokes, `lane ${lane}`).toContain(`var(--ws-lane-${lane})`);
    }
  });

  /*
    The reduced-motion frame is a *still*, not a slower loop: one copy of the
    list, no scrolling group, no write head, and no pulse — SMIL is the half of
    the motion policy CSS cannot reach, so an `<animate>` has to be absent
    rather than disarmed.
  */
  it('shows a single static copy under reduced motion', () => {
    render(<Showcase reduced />);
    expect(screen.getAllByTestId('showcase-copy')).toHaveLength(1);
    expect(screen.queryByTestId('showcase-scroll')).toBeNull();
    expect(screen.queryByTestId('showcase-pulse')).toBeNull();
    expect(screen.queryByTestId('showcase-write')).toBeNull();
    expect(screen.getByTestId('showcase-graph').dataset.animated).toBe('false');
  });

  it('stacks three copies and slides exactly one of them, with motion', () => {
    render(<Showcase reduced={false} />);
    const graph = screen.getByTestId('showcase-graph');

    // Three copies, because the window is one copy tall: two leave the top
    // row-slot empty over the last pitch of every pass. Sliding *exactly* one
    // copy is what makes the loop seamless — see the component.
    expect(screen.getAllByTestId('showcase-copy')).toHaveLength(3);
    expect(screen.getByTestId('showcase-scroll')).toBeTruthy();

    const shift = graph.style.getPropertyValue('--ws-graph-shift');
    const pitch = graph.style.getPropertyValue('--ws-graph-pitch');
    expect(Number.parseFloat(shift)).toBe(20 * Number.parseFloat(pitch));
  });

  it('times one arrival per step, and one pass per commit', () => {
    render(<Showcase reduced={false} />);
    const graph = screen.getByTestId('showcase-graph');

    const loop = Number.parseFloat(graph.style.getPropertyValue('--ws-graph-loop'));
    const step = Number.parseFloat(graph.style.getPropertyValue('--ws-graph-step'));
    expect(loop).toBe(step * 20);
  });

  it('draws the arriving edge and keeps the gentle pulse, with motion', () => {
    render(<Showcase reduced={false} />);

    // `pathLength="1"` is what lets one dash length serve any geometry.
    const write = screen.getByTestId('showcase-write');
    expect(write.getAttribute('pathLength')).toBe('1');

    const pulse = screen.getByTestId('showcase-pulse');
    expect(pulse.querySelectorAll('animate')).toHaveLength(2);
  });
});
