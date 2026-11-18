// vitest/jsdom: create, rename, duplicate, delete and keyboard selection over a mock bridge.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_FLEET_PROJECTIONS, type FleetProjection, type PlanLine } from '@midnite/studio-shared';

import { ProjectionList } from './projection-list';
import { fleetNode, fleetProjection } from './test-fixtures';
import { renderWithChrome } from './test-harness';

const ok = { ok: true, value: {} };
const bridge = { upsertFleetProjection: vi.fn(async () => ok), duplicateFleetProjection: vi.fn(async () => ok), removeFleetProjection: vi.fn(async () => ok), unlinkFleetProjectionLines: vi.fn(async () => ok), onChanged: () => () => undefined };

function show(projections: FleetProjection[], selectedId: string | null = projections[0]?.id ?? null, onSelect = vi.fn(), lines: PlanLine[] = []) {
  renderWithChrome(<ProjectionList projections={projections} lines={lines} selectedId={selectedId} readOnly={false} onSelect={onSelect} />);
  return onSelect;
}

beforeEach(() => {
  for (const f of [bridge.upsertFleetProjection, bridge.duplicateFleetProjection, bridge.removeFleetProjection, bridge.unlinkFleetProjectionLines]) f.mockClear();
  window.midniteStudio = { startup: bridge } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('ProjectionList', () => {
  it('creates from "GPU cluster" with 4 nodes, naming it Projection then Projection 2', async () => {
    const existing = [fleetProjection({ name: 'Projection' })];
    show(existing);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('button', { name: 'GPU cluster' }));
    await waitFor(() => expect(bridge.upsertFleetProjection).toHaveBeenCalledTimes(1));
    const sent = (bridge.upsertFleetProjection.mock.calls[0] as unknown as [{ projection: FleetProjection }])[0].projection;
    expect(sent.nodes).toHaveLength(4);
    expect(sent.name).toBe('Projection 2');
  });

  it('names the first one plain "Projection"', async () => {
    show([]);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blank' }));
    await waitFor(() => expect(bridge.upsertFleetProjection).toHaveBeenCalled());
    expect((bridge.upsertFleetProjection.mock.calls[0] as unknown as [{ projection: FleetProjection }])[0].projection.name).toBe('Projection');
  });

  it('rename: Esc restores, an empty name alerts and never calls the bridge, Enter saves the trimmed name', async () => {
    show([fleetProjection({ name: 'Alpha' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    let input = screen.getByLabelText('Projection name');
    fireEvent.change(input, { target: { value: 'Beta' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('Projection name')).toBeNull();
    expect(screen.getByText('Alpha')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    input = screen.getByLabelText('Projection name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert').textContent).toBe('Name must be 1–80 characters');
    expect(bridge.upsertFleetProjection).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '  Beta ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(bridge.upsertFleetProjection).toHaveBeenCalledTimes(1));
    expect((bridge.upsertFleetProjection.mock.calls[0] as unknown as [{ projection: FleetProjection }])[0].projection.name).toBe('Beta');
  });

  it('duplicates as "<name> copy"', async () => {
    const p = fleetProjection({ name: 'Alpha' });
    show([p]);
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(bridge.duplicateFleetProjection).toHaveBeenCalledWith({ id: p.id, name: 'Alpha copy' }));
  });

  it('duplicate selects the copy found after its source in the returned snapshot', async () => {
    const a = fleetProjection({ name: 'Alpha' });
    const b = fleetProjection({ name: 'Beta' }, 2);
    const copy = fleetProjection({ name: 'Alpha copy' }, 3);
    bridge.duplicateFleetProjection.mockResolvedValueOnce({ ok: true, value: { fleetProjections: [a, copy, b] } });
    const onSelect = show([a, b]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]!);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(copy.id));
  });

  it('exactly one row is a tab stop, and it follows the selection', () => {
    const a = fleetProjection({ name: 'Alpha' });
    const b = fleetProjection({ name: 'Beta' }, 2);
    show([a, b], b.id);
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('tabindex'))).toEqual(['-1', '0']);
    cleanup();
    show([a, b], null);
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });

  it('delete asks first and removes only on confirm', async () => {
    const p = fleetProjection({ name: 'Alpha' });
    show([p]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(bridge.removeFleetProjection).not.toHaveBeenCalled();
    expect(await screen.findByText('Delete Alpha?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete projection' }));
    await waitFor(() => expect(bridge.removeFleetProjection).toHaveBeenCalledWith({ id: p.id }));
  });

  it('offers to remove or keep the Runway lines a projection wrote, unlinking before the removal', async () => {
    const p = fleetProjection({ name: 'Alpha' });
    const linked: PlanLine = { id: '00000000-0000-4000-8000-000000000500', kind: 'cost', name: 'x', category: 'other', minor: 1, cadence: 'monthly', start: '2026-12', growthBpPerMonth: 0, source: { kind: 'fleetProjection', projectionId: p.id, part: 'opex', syncedAt: '2026-11-18T10:00:00.000Z' } };
    show([p], p.id, vi.fn(), [linked]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete and remove its 1 Runway line' }));
    await waitFor(() => expect(bridge.removeFleetProjection).toHaveBeenCalledWith({ id: p.id }));
    expect(bridge.unlinkFleetProjectionLines).toHaveBeenCalledWith({ projectionId: p.id, removeLines: true });
    cleanup();
    show([p], p.id, vi.fn(), [linked]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete, keep lines' }));
    await waitFor(() => expect(bridge.unlinkFleetProjectionLines).toHaveBeenLastCalledWith({ projectionId: p.id, removeLines: false }));
  });

  it('prints a negative net margin in text-destructive', () => {
    show([fleetProjection({ nodes: [fleetNode(1, { utilisationPct: 0 })] })]);
    const figure = screen.getByText(/\$\d/, { selector: 'span.text-destructive' });
    expect(figure.textContent).toMatch(/^−\$/);
  });

  it('disables New at the projection cap', () => {
    show(Array.from({ length: MAX_FLEET_PROJECTIONS }, (_, i) => fleetProjection({}, i + 1)));
    expect((screen.getByRole('button', { name: 'New' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('ArrowDown selects the next row', () => {
    const [a, b] = [fleetProjection({}, 1), fleetProjection({ name: 'B' }, 2)];
    const onSelect = show([a, b], a.id);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Projections' }), { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenCalledWith(b.id);
  });
});
