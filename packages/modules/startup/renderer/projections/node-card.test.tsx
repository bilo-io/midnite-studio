// vitest/jsdom: the override dot, zeroed figures when disabled, and un-confirmed removal.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { seedFleetCatalog, type FleetProjection } from '@midnite/studio-shared';

import { computeFleetProjection } from './fleet-model';
import { NodeCard } from './node-card';
import { fleetNode, fleetProjection } from './test-fixtures';
import { renderWithChrome } from './test-harness';

afterEach(cleanup);
let latest: FleetProjection;

function Host({ initial }: { initial: FleetProjection }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  const node = draft.nodes[0];
  const result = computeFleetProjection(draft, seedFleetCatalog('USD'));
  return node === undefined ? null : <NodeCard node={node} template={draft.template} figures={result.perNode[node.id]} update={(fn) => setDraft(fn)} readOnly={false} />;
}

const one = () => fleetProjection({ nodes: [fleetNode(1)] });

describe('NodeCard', () => {
  it('shows the override dot only after a field differs from the template', () => {
    renderWithChrome(<Host initial={one()} />);
    expect(screen.queryByTitle('Differs from the template')).toBeNull();
    fireEvent.change(screen.getAllByRole('slider')[1]!, { target: { value: '30' } });
    expect(screen.getByTitle('Differs from the template')).toBeTruthy();
  });

  it('disabling zeroes the three figures', () => {
    renderWithChrome(<Host initial={one()} />);
    expect(screen.queryAllByText('$0')).toHaveLength(0);
    fireEvent.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(screen.getAllByText('$0')).toHaveLength(3);
  });

  it('Remove drops the node with no dialog', () => {
    renderWithChrome(<Host initial={one()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove node' }));
    expect(latest.nodes).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
