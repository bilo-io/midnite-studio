import type { GraphRow, Ref } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommitGraphRow } from './graph-row';
import { graphThemeFor } from './graph-themes';
import { laneHsl } from './lane-colors';

/**
 * The selected row's tint, its ink and the branch halo are all CSS built from
 * `--lane-h/s/l`, so jsdom — which computes no stylesheet here — can only be
 * asked for the two things React actually renders: the custom properties, and
 * which elements carry the classes those rules hang off.
 *
 * That is the whole contract worth pinning. Whether 0.16 alpha looks right is a
 * screenshot's job (e2e/graph-selection.spec.ts); whether the SELECTED row
 * publishes its own lane's numbers, and whether a row two lanes over stays out
 * of the halo, is logic that can silently invert.
 */
// `git-graph` is the default style: an avatar node, so no Author column and a
// lane rail between the graph and the subject.
const theme = graphThemeFor('git-graph', 'comfortable');

const makeRow = (sha: string, colorIdx: number, lane = 0): GraphRow => ({
  row: 0,
  commit: {
    sha,
    subject: 'feat: something',
    authorEmail: 'author@example.com',
    authorName: 'Author',
    authorDate: 1_700_000_000,
    committerDate: 1_700_000_000,
    parents: [],
    refs: [],
  },
  lane,
  colorIdx,
  edges: [
    { fromLane: lane, toLane: lane, type: 'straight', colorIdx },
    { fromLane: 1, toLane: 1, type: 'straight', colorIdx: 7 },
  ],
  laneCount: 2,
});

const renderRow = (row: GraphRow, over: Partial<Parameters<typeof CommitGraphRow>[0]> = {}) => {
  const result = render(
    <CommitGraphRow
      row={row}
      refs={[]}
      selected={false}
      gutterWidth={80}
      laneWidth={16}
      theme={theme}
      clipId="clip"
      dimmed={false}
      onSelect={vi.fn()}
      onContextMenu={vi.fn()}
      onRefContextMenu={vi.fn()}
      onRefActivate={vi.fn()}
      syncFor={() => []}
      onSync={vi.fn()}
      syncing={{}}
      currentBranch="main"
      {...over}
    />,
  );
  return result.container.querySelector('[role="row"]') as HTMLElement;
};

describe('selected commit row', () => {
  afterEach(cleanup);

  it('publishes its own lane hue, so the tint and ink are the branch colour', () => {
    const [h, s, l] = laneHsl(3, theme.palette);
    const el = renderRow(makeRow('abc', 3), { selected: true, glowColorIdx: 3 });

    expect(el.className).toContain('graph-row');
    expect(el.getAttribute('aria-selected')).toBe('true');
    expect(el.style.getPropertyValue('--lane-h')).toBe(`${h}`);
    expect(el.style.getPropertyValue('--lane-s')).toBe(`${s}%`);
    expect(el.style.getPropertyValue('--lane-l')).toBe(`${l}%`);
  });

  it('does not paint the accent hue behind the selection any more', () => {
    const el = renderRow(makeRow('abc', 3), { selected: true, glowColorIdx: 3 });
    expect(el.className).not.toContain('bg-accent');
  });

  it('marks the subject, author, date and sha as lane-tinted ink', () => {
    // Subject, date and sha. No author — the avatar styles put the name in the
    // node's tooltip rather than a column of its own.
    const el = renderRow(makeRow('abcdef1234567', 3), { selected: true });
    expect(el.querySelectorAll('.graph-row-ink')).toHaveLength(3);
  });
});

describe('branch halo', () => {
  afterEach(cleanup);

  it('is absent while nothing is selected', () => {
    const el = renderRow(makeRow('abc', 3));
    expect(el.querySelector('[data-graph-glow]')).toBeNull();
    expect(el.querySelector('.graph-rail-glow')).toBeNull();
  });

  it('haloes only the edges on the lit lane, node ring included', () => {
    const el = renderRow(makeRow('abc', 3), { glowColorIdx: 3 });
    const glow = el.querySelector('[data-graph-glow]');
    expect(glow).not.toBeNull();
    // One copied edge (the row's own lane) plus the node ring — the colorIdx 7
    // lane passing through the same row is left alone.
    expect(glow!.querySelectorAll('line, path')).toHaveLength(1);
    expect(glow!.querySelectorAll('circle')).toHaveLength(1);
    expect(glow!.getAttribute('style')).toContain('--lane-h');
    expect(el.querySelector('[data-graph-rail]')!.className).toContain('graph-rail-glow');
  });

  it('draws no node ring on a row the lane only passes through', () => {
    // colorIdx 7 is lit; this row SITS on lane 3 and merely carries a 7 edge.
    const el = renderRow(makeRow('abc', 3), { glowColorIdx: 7 });
    const glow = el.querySelector('[data-graph-glow]')!;
    expect(glow.querySelectorAll('line, path')).toHaveLength(1);
    expect(glow.querySelectorAll('circle')).toHaveLength(0);
    // The rail is the row's OWN lane, which is not the one lit.
    expect(el.querySelector('[data-graph-rail]')!.className).not.toContain('graph-rail-glow');
  });

  it('leaves a row on an unlit lane entirely alone', () => {
    const el = renderRow(makeRow('abc', 3), { glowColorIdx: 5 });
    const glow = el.querySelector('[data-graph-glow]')!;
    expect(glow.querySelectorAll('line, path, circle')).toHaveLength(0);
  });

  it('haloes the connector line and branch badges when row is on the lit lane', () => {
    const testRef: Ref = {
      name: 'feature/glow',
      fullName: 'refs/heads/feature/glow',
      kind: 'localBranch',
      sha: 'abc',
      isHead: false,
      worktreePath: null,
      upstream: null,
    };
    const el = renderRow(makeRow('abc', 3), { glowColorIdx: 3, refs: [testRef] });
    const glow = el.querySelector('[data-graph-glow]')!;
    // In SVG halo: 1 edge line + 1 connector line + 1 circle = 2 lines + 1 circle
    expect(glow.querySelectorAll('line')).toHaveLength(2);
    expect(glow.querySelectorAll('circle')).toHaveLength(1);

    // HTML connector line has graph-rail-glow
    const connector = el.querySelector('[data-graph-connector]');
    expect(connector).not.toBeNull();
    expect(connector!.className).toContain('graph-rail-glow');

    // Ref badge has graph-badge-glow
    const badge = el.querySelector('[data-ref="refs/heads/feature/glow"]');
    expect(badge).not.toBeNull();
    expect(badge!.className).toContain('graph-badge-glow');
  });

  it('does not glow connector line or badge on unlit lane', () => {
    const testRef: Ref = {
      name: 'feature/unlit',
      fullName: 'refs/heads/feature/unlit',
      kind: 'localBranch',
      sha: 'abc',
      isHead: false,
      worktreePath: null,
      upstream: null,
    };
    const el = renderRow(makeRow('abc', 3), { glowColorIdx: 5, refs: [testRef] });

    const connector = el.querySelector('[data-graph-connector]');
    expect(connector!.className).not.toContain('graph-rail-glow');

    const badge = el.querySelector('[data-ref="refs/heads/feature/unlit"]');
    expect(badge!.className).not.toContain('graph-badge-glow');
  });
});
