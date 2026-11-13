// vitest/jsdom: the roadmap's list, sheet and errors over a mock bridge. The timeline's bar geometry needs real
// layout and is asserted in Theme G's browser spec.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Milestone } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const m = (n: number, over: Partial<Milestone> = {}): Milestone => ({
  id: u(n), title: `M${n}`, description: '', status: 'planned', due: '2099-06-01', dependsOn: [], tags: [], ...over,
});
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } };
const snapshot = (milestones: Milestone[]) => ({
  ok: true,
  value: { workspace: { version: 1, company, milestones, lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null }, revision: 0, readOnly: false },
});

function install(milestones: Milestone[], upsertMilestone = vi.fn(async () => snapshot(milestones))) {
  window.midniteStudio = {
    startup: { get: vi.fn(async () => snapshot(milestones)), upsertMilestone, removeMilestone: vi.fn(), onChanged: () => () => undefined },
  } as unknown as typeof window.midniteStudio;
  return upsertMilestone;
}

const renderRoadmap = () => render(<StartupPane view="startup.roadmap" onView={() => undefined} />);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('RoadmapView', () => {
  it('shows the empty state with an Add milestone action', async () => {
    install([]);
    renderRoadmap();
    expect(await screen.findByText('No milestones yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add milestone' })).toBeTruthy();
  });

  it('adds a milestone through the sheet', async () => {
    const upsert = install([]);
    renderRoadmap();
    fireEvent.click(await screen.findByRole('button', { name: 'Add milestone' }));
    const sheet = await screen.findByRole('complementary', { name: 'Add milestone' });
    fireEvent.change(within(sheet).getByLabelText('Title'), { target: { value: 'Beta launch' } });
    fireEvent.change(within(sheet).getByLabelText('Due'), { target: { value: '2099-03-01' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect((upsert.mock.calls[0] as unknown as [{ milestone: Milestone }])[0].milestone).toMatchObject({ title: 'Beta launch', due: '2099-03-01', status: 'planned', dependsOn: [] });
  });

  it('greys out the dependency choice that would make a loop', async () => {
    install([m(1), m(2, { dependsOn: [u(1)] })]);
    renderRoadmap();
    fireEvent.click(await screen.findByRole('button', { name: /M1/ }));
    const sheet = await screen.findByRole('complementary', { name: 'Edit milestone' });
    expect((within(sheet).getByLabelText('M2') as HTMLInputElement).disabled).toBe(true);
  });

  it('shows main\'s cycle refusal as it arrives', async () => {
    const upsert = install([m(1)], vi.fn(async () => ({ ok: false, kind: 'cycle', message: 'That would make a loop: M1 → M2 → M1.' })) as never);
    renderRoadmap();
    fireEvent.click(await screen.findByRole('button', { name: /M1/ }));
    const sheet = await screen.findByRole('complementary', { name: 'Edit milestone' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));
    expect((await within(sheet).findByRole('alert')).textContent).toBe('That would make a loop: M1 → M2 → M1.');
    expect(upsert).toHaveBeenCalled();
  });

  it('marks At risk and Overdue', async () => {
    install([m(1, { due: '2099-06-01' }), m(2, { due: '2099-05-01', dependsOn: [u(1)] }), m(3, { due: '2020-01-01' })]);
    renderRoadmap();
    await screen.findByText('M3');
    expect(screen.getAllByText('At risk')).toHaveLength(1);
    expect(screen.getAllByText('Overdue')).toHaveLength(1);
  });

  it('switches to the timeline and remembers the choice', async () => {
    install([m(1), m(2, { dependsOn: [u(1)], due: '2099-08-01' })]);
    renderRoadmap();
    fireEvent.click(await screen.findByRole('button', { name: 'timeline' }));
    expect(await screen.findByTestId('roadmap-timeline')).toBeTruthy();
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-edge]')).toHaveLength(1);
    expect(localStorage.getItem('midnite-startup.roadmap.mode')).toBe('timeline');
  });
});
