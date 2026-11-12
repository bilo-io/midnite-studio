// vitest/jsdom: the panel over a fake `window.midniteStudio.simulator` bridge.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameChromeProvider } from '@midnite/studio-frame';
import type { SimScenario, SimScenarioSummary } from '@midnite/studio-shared';

import { SIMULATOR_CHROME, SimulatorDialogHost } from '../compose/simulator-chrome';
import { ScenarioPanel } from './scenario-panel';

const scenario = (over: Partial<SimScenario> = {}): SimScenario => ({
  version: 1,
  id: 'sim-aaaaaaaaaaaa',
  kind: 'life',
  title: 'Glider',
  seed: 1,
  params: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const summary = (s: SimScenario): SimScenarioSummary => ({ id: s.id, kind: s.kind, title: s.title, updatedAt: s.updatedAt });

function install(stored: SimScenario[]) {
  const api = {
    list: vi.fn(async () => ({ ok: true as const, value: { scenarios: stored.map(summary), quarantined: 0 } })),
    read: vi.fn(async ({ id }: { id: string }) => ({ ok: true as const, value: { scenario: stored.find((s) => s.id === id)! } })),
    save: vi.fn(async ({ scenario: d }: { scenario: { title: string } }) => {
      const made = scenario({ id: 'sim-bbbbbbbbbbbb', title: d.title });
      stored.push(made);
      return { ok: true as const, value: { scenario: made } };
    }),
    rename: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal('window', Object.assign(window, { midniteStudio: { simulator: api } }));
  return api;
}

const mount = (apply: (s: SimScenario) => string | null = () => null) =>
  render(
    <FrameChromeProvider chrome={SIMULATOR_CHROME}>
      <ScenarioPanel kinds={['life', 'elementary']} kind="life" capture={async () => ({ seed: 1, params: {} })} apply={apply} />
      <SimulatorDialogHost />
    </FrameChromeProvider>,
  );

beforeEach(() => void 0);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('ScenarioPanel', () => {
  it('lists only the scenarios of its kinds', async () => {
    install([scenario(), scenario({ id: 'sim-cccccccccccc', kind: 'nbody', title: 'Orbit' })]);
    mount();
    expect(await screen.findByText('Glider')).toBeTruthy();
    expect(screen.queryByText('Orbit')).toBeNull();
  });

  it('asks for a title on Save, then lists the new scenario', async () => {
    const api = install([]);
    mount();
    await screen.findByText('No saved scenarios yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const input = await screen.findByRole('textbox');
    fireEvent.change(input, { target: { value: 'My run' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    });
    await waitFor(() => expect(api.save).toHaveBeenCalled());
    expect(await screen.findByText('My run')).toBeTruthy();
  });

  it('shows the cannot-open message for a scenario whose params do not fit, and keeps it listed', async () => {
    install([scenario()]);
    mount(() => 'invalid');
    fireEvent.click(await screen.findByText('Glider'));
    expect(await screen.findByText(/cannot be opened/)).toBeTruthy();
    expect(screen.getByText('Glider')).toBeTruthy();
  });

  it('shows an error banner with Retry when the list fails', async () => {
    const api = install([]);
    api.list.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'disk gone' } as never);
    mount();
    expect(await screen.findByText('disk gone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No saved scenarios yet.')).toBeTruthy();
  });
});
