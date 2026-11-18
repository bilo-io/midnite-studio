// vitest/jsdom: the view over a mock bridge — empty state, selection fallback and read-only.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FleetProjection } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';
import { fleetProjection, u } from './test-fixtures';

const snapshot = (fleetProjections: FleetProjection[], readOnly = false) => ({
  ok: true,
  value: { workspace: { version: 3, fleetProjections, company: null, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null }, revision: 0, readOnly },
});
function install(projections: FleetProjection[], readOnly = false) {
  window.midniteStudio = { startup: { get: vi.fn(async () => snapshot(projections, readOnly)), upsertFleetProjection: vi.fn(), onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
}
const renderView = () => render(<StartupPane view="startup.projections" onView={() => undefined} />);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('ProjectionsView', () => {
  it('shows the empty state with three starter buttons, and no company gate', async () => {
    install([]);
    renderView();
    expect(await screen.findByText('No projections yet')).toBeTruthy();
    for (const label of ['Blank', 'GPU cluster', 'API only']) expect(screen.getAllByRole('button', { name: label }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Set up your company')).toBeNull();
    expect(screen.getByText('Select a projection')).toBeTruthy();
  });

  it('selects the first projection when the stored id no longer exists', async () => {
    localStorage.setItem('midnite-startup.projections.selectedId', u(999));
    install([fleetProjection({}, 1), fleetProjection({ name: 'Second' }, 2)]);
    renderView();
    const options = await screen.findAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    expect(options[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('read-only: shows the banner and disables every control', async () => {
    install([fleetProjection()], true);
    const { container } = renderView();
    expect(await screen.findByText(/newer Midnite Startup/)).toBeTruthy();
    const controls = [...container.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select')].filter((el) => el.getAttribute('role') !== 'separator');
    expect(controls.length).toBeGreaterThan(5);
    for (const el of controls) expect(el.disabled || el.getAttribute('aria-disabled') === 'true', el.outerHTML.slice(0, 80)).toBe(true);
  });
});
