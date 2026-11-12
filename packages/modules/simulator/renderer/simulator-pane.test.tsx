// vitest/jsdom: the pane routes a view id to its sandbox view.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { navConfigProblems } from '@midnite/studio-frame';

import { SimulatorPane } from './simulator-pane';
import { SIMULATOR_NAV_GROUP } from './simulator-nav';

afterEach(cleanup);

describe('SimulatorPane', () => {
  it.each([
    ['sim-automata', 'Emergence'],
    ['sim-worlds', 'Virtual worlds'],
    ['sim-agents', 'Agent environments'],
    ['anything-else', 'Emergence'],
  ])('routes %s to %s', (view, title) => {
    render(<SimulatorPane view={view} onView={() => undefined} />);
    expect(screen.getByRole('region', { name: title })).toBeDefined();
  });

  it('has a sound nav group with sim- prefixed view ids', () => {
    expect(navConfigProblems({ views: SIMULATOR_NAV_GROUP.views } as never)).toEqual([]);
    for (const v of SIMULATOR_NAV_GROUP.views) expect(v.id.startsWith('sim-')).toBe(true);
  });
});
