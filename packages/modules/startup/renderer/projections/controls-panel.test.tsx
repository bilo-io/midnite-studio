// vitest/jsdom: Spawn, Apply-to-all (confirmed) and the horizon toggle against a draft held in state.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { FleetProjection } from '@midnite/studio-shared';

import { ControlsPanel } from './controls-panel';
import { fleetNode, fleetProjection } from './test-fixtures';
import { renderWithChrome } from './test-harness';

afterEach(cleanup);
let latest: FleetProjection;

function Host({ initial }: { initial: FleetProjection }) {
  const [draft, setDraft] = useState(initial);
  latest = draft;
  return <ControlsPanel draft={draft} update={(fn) => setDraft(fn)} readOnly={false} />;
}

describe('ControlsPanel', () => {
  it('Spawn adds Node 5 to a 4-node draft', () => {
    renderWithChrome(<Host initial={fleetProjection()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spawn node' }));
    expect(latest.nodes).toHaveLength(5);
    expect(latest.nodes[4]!.name).toBe('Node 5');
  });

  it('Apply to all confirms, then rewrites configs but keeps names and enabled', async () => {
    const initial = fleetProjection({ template: { hardwareId: 'a100-node', apiTierId: 'pro', quantity: 3, utilisationPct: 40, pricePerHourCents: 900 }, nodes: [fleetNode(1, { enabled: false, name: 'Keep me' }), fleetNode(2)] });
    renderWithChrome(<Host initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply template to all' }));
    expect(latest.nodes[0]!.hardwareId).toBe('dual-4090');
    await act(async () => void fireEvent.click(await screen.findByRole('button', { name: 'Apply to 2 nodes' })));
    expect(latest.nodes.every((n) => n.hardwareId === 'a100-node' && n.quantity === 3 && n.utilisationPct === 40)).toBe(true);
    expect(latest.nodes[0]!.name).toBe('Keep me');
    expect(latest.nodes[0]!.enabled).toBe(false);
  });

  it('the horizon toggle marks exactly one button checked', () => {
    renderWithChrome(<Host initial={fleetProjection()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    fireEvent.click(radios[0]!);
    expect(latest.globals.horizonMonths).toBe(12);
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });
});
