// vitest/jsdom: the runway's headline copy, scenario tabs and sheet over a mock bridge. The chart's pixel geometry is
// a browser concern (Theme G's shots); here only that it renders.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BASE_SCENARIO_ID, type PlanLine, type RunwayScenario } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 10_000_000, asOf: '2026-11-01' } };
const line: PlanLine = { id: u(5), kind: 'cost', name: 'Rent', category: 'premises', minor: 100_000, cadence: 'monthly', start: '2026-11', growthBpPerMonth: 0 };
const scenarioTwo: RunwayScenario = { id: u(9), name: 'Lean', costMultiplierBp: 8000, revenueMultiplierBp: 10000, extraLines: [] };
const snapshot = (lines: PlanLine[], scenarios: RunwayScenario[]) => ({
  ok: true,
  value: { workspace: { version: 4, fleetProjections: [], company, milestones: [], lines, scenarios, customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null }, revision: 0, readOnly: false },
});
const projection = (over: object = {}) => ({
  ok: true,
  value: { months: [{ month: '2026-11', revenueMinor: 0, costMinor: 100_000, netMinor: -100_000, cashMinor: 9_900_000 }], burnMinor: -100_000, runwayMonths: null, zeroCashMonth: null, defaultAlive: false, ...over },
});

function install(lines: PlanLine[], scenarios: RunwayScenario[], proj = vi.fn(async (_req: unknown) => projection()), exportRunwayCsv = vi.fn()) {
  window.midniteStudio = {
    startup: { get: vi.fn(async () => snapshot(lines, scenarios)), projection: proj, upsertScenario: vi.fn(), removeScenario: vi.fn(), upsertLine: vi.fn(), removeLine: vi.fn(), exportRunwayCsv, onChanged: () => () => undefined },
  } as unknown as typeof window.midniteStudio;
  return proj;
}
const renderRunway = () => render(<StartupPane view="startup.runway" onView={() => undefined} />);

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('RunwayView', () => {
  it('asks for the first cost when there are no lines', async () => {
    install([], []);
    renderRunway();
    expect(await screen.findByText('Add your first cost')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add line' })).toBeTruthy();
  });

  it('exports the runway CSV for the active scenario and horizon', async () => {
    const exportCsv = vi.fn(async (_req: unknown) => ({ ok: true, value: { saved: true } }));
    install([line], [], undefined, exportCsv);
    renderRunway();
    await screen.findByText('Beyond 36 months');
    fireEvent.change(screen.getByLabelText('Horizon'), { target: { value: '24' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(exportCsv).toHaveBeenCalledWith({ scenarioId: BASE_SCENARIO_ID, months: 24 }));
  });

  it('says "Beyond 36 months" when cash never runs out in the horizon', async () => {
    install([line], []);
    renderRunway();
    expect(await screen.findByText('Beyond 36 months')).toBeTruthy();
    expect(screen.getByText('Default dead')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Cash by month' })).toBeTruthy();
  });

  it('shows months of runway and the zero-cash month when cash runs out', async () => {
    install([line], [], vi.fn(async () => projection({ runwayMonths: 10, zeroCashMonth: '2027-09', defaultAlive: true })));
    renderRunway();
    expect(await screen.findByText('10 months')).toBeTruthy();
    expect(screen.getByText('2027-09')).toBeTruthy();
    expect(screen.getByText('Default alive')).toBeTruthy();
  });

  it('switches the projection request with the scenario tab and the horizon', async () => {
    const proj = install([line], [scenarioTwo]);
    renderRunway();
    await screen.findByText('Beyond 36 months');
    expect(proj).toHaveBeenLastCalledWith({ scenarioId: BASE_SCENARIO_ID, months: 36 });
    fireEvent.click(screen.getByRole('tab', { name: 'Lean' }));
    await waitFor(() => expect(proj).toHaveBeenLastCalledWith({ scenarioId: u(9), months: 36 }));
    fireEvent.change(screen.getByLabelText('Horizon'), { target: { value: '12' } });
    await waitFor(() => expect(proj).toHaveBeenLastCalledWith({ scenarioId: u(9), months: 12 }));
  });

  it('offers no remove on Base, and one on another scenario', async () => {
    install([line], [scenarioTwo]);
    renderRunway();
    await screen.findByText('Beyond 36 months');
    expect(screen.queryByRole('button', { name: 'Remove scenario' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Lean' }));
    expect(screen.getByRole('button', { name: 'Remove scenario' })).toBeTruthy();
  });

  it('saves a new line in minor units', async () => {
    install([], []);
    const upsertLine = vi.fn(async () => snapshot([], []));
    (window.midniteStudio as unknown as { startup: { upsertLine: unknown } }).startup.upsertLine = upsertLine;
    renderRunway();
    fireEvent.click(await screen.findByRole('button', { name: 'Add line' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Laptops' } });
    fireEvent.change(screen.getByLabelText('Amount (GBP)'), { target: { value: '1,250.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(upsertLine).toHaveBeenCalledTimes(1));
    expect((upsertLine.mock.calls[0] as unknown as [{ line: PlanLine }])[0].line).toMatchObject({ name: 'Laptops', minor: 125050, kind: 'cost', cadence: 'monthly' });
  });

  it('shows the linked book\'s cash and actual burn beside the modelled burn', async () => {
    const linked = { ...snapshot([line], []).value.workspace, ledger: { bookId: 'b', accounts: { receivable: 'a', sales: 'b', taxPayable: 'c', bank: 'd' } } };
    window.midniteStudio = {
      startup: {
        get: vi.fn(async () => ({ ok: true, value: { workspace: linked, revision: 0, readOnly: false } })),
        projection: vi.fn(async () => projection()),
        ledgerSummary: vi.fn(async () => ({ ok: true, value: { bookName: 'Acme Ltd', cashMinor: 4_200_000, asOf: '2026-11-12', actualBurnMinor: 150_000 } })),
        onChanged: () => () => undefined,
      },
    } as unknown as typeof window.midniteStudio;
    renderRunway();
    expect(await screen.findByText('From Acme Ltd')).toBeTruthy();
    expect(screen.getByText('£42,000.00')).toBeTruthy();
    expect(screen.getByText(/Modelled £1,000.00, \+£500.00 from plan/)).toBeTruthy();
    expect(screen.queryByText('Link a book to use actuals.')).toBeNull();
  });
});

describe('the lines table', () => {
  it('prints an amount to both minor digits, padded off the From column', async () => {
    install([{ ...line, minor: 117_320 }], []);
    renderRunway();
    const cell = await screen.findByTestId('runway-line-amount');
    expect(cell.textContent).toBe('-£1,173.20');
    expect(cell.className).toContain('pr-6');
  });
});

describe('lines written by a projection', () => {
  const pid = u(70);
  const linked: PlanLine = { ...line, id: u(6), name: 'GPU — running costs', source: { kind: 'fleetProjection', projectionId: pid, part: 'opex', syncedAt: '2026-11-17T10:00:00.000Z' } };
  const proj = { id: pid, name: 'GPU plan', updatedAt: '2026-11-18T10:00:00.000Z' };
  const installWith = (lines: PlanLine[], fleetProjections: object[]) => {
    install(lines, []);
    const get = window.midniteStudio!.startup!.get as unknown as ReturnType<typeof vi.fn>;
    get.mockImplementation(async () => {
      const snap = snapshot(lines, []);
      return { ...snap, value: { ...snap.value, workspace: { ...snap.value.workspace, fleetProjections } } };
    });
  };

  it('shows a From badge and a Stale pill, and the sheet warns that editing unlinks', async () => {
    installWith([linked, line], [proj]);
    renderRunway();
    expect(await screen.findByRole('button', { name: /From GPU plan/ })).toBeTruthy();
    expect(screen.getAllByText('Stale')).toHaveLength(1);
    fireEvent.click(screen.getByText('GPU — running costs'));
    expect(screen.getByText('Editing unlinks this line from its projection.')).toBeTruthy();
  });

  it('shows no pill for a line that is up to date, and no badge on ordinary lines', async () => {
    installWith([{ ...linked, source: { ...linked.source!, syncedAt: '2026-11-18T10:00:00.000Z' } }, line], [proj]);
    renderRunway();
    await screen.findByRole('button', { name: /From GPU plan/ });
    expect(screen.queryByText('Stale')).toBeNull();
    expect(screen.getAllByRole('button', { name: /From / })).toHaveLength(1);
  });
});
