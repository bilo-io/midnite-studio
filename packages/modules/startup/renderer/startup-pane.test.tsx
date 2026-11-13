// vitest/jsdom: every nav view renders a pane over a mock bridge, and the first-run setup form writes through it.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StartupSnapshot } from '@midnite/studio-shared';

import { STARTUP_NAV_GROUP } from './startup-nav';
import { StartupPane } from './startup-pane';

const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 10000000, asOf: '2026-11-01' } };
const snapshot = (withCompany: boolean, extra: Partial<StartupSnapshot> = {}): StartupSnapshot => ({
  workspace: { version: 1, company: withCompany ? company : null, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null },
  revision: 0,
  readOnly: false,
  ...extra,
});

function install(get: () => unknown, updateCompany = vi.fn()) {
  window.midniteStudio = { startup: { get: vi.fn(async () => get()), updateCompany, onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
  return updateCompany;
}

beforeEach(() => install(() => ({ ok: true, value: snapshot(true) })));
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('StartupPane', () => {
  it('renders every nav view without throwing, titled by the view', async () => {
    for (const view of STARTUP_NAV_GROUP.views) {
      const { unmount } = render(<StartupPane view={view.id} onView={() => undefined} />);
      expect(await screen.findByRole('main', { name: view.label })).toBeTruthy();
      unmount();
    }
  });

  it('asks for the company first, on every view, and saves it in minor units', async () => {
    const updateCompany = install(() => ({ ok: true, value: snapshot(false) }), vi.fn(async () => ({ ok: true, value: snapshot(true) })));
    render(<StartupPane view="startup.runway" onView={() => undefined} />);
    expect(await screen.findByText('Set up your company')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Opening cash'), { target: { value: '1,250.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(updateCompany).toHaveBeenCalledTimes(1));
    expect(updateCompany.mock.calls[0]![0].company).toMatchObject({ name: 'Acme', currency: 'GBP', openingCash: { minor: 125050 } });
  });

  it('says why when the workspace cannot load', async () => {
    install(() => ({ ok: false, kind: 'io', message: 'Disk on fire' }));
    render(<StartupPane view="startup.overview" onView={() => undefined} />);
    expect((await screen.findByRole('alert')).textContent).toBe('Disk on fire');
  });

  it('flags a read-only workspace from a newer build', async () => {
    install(() => ({ ok: true, value: snapshot(true, { readOnly: true }) }));
    render(<StartupPane view="startup.overview" onView={() => undefined} />);
    expect(await screen.findByText(/newer Midnite Startup/)).toBeTruthy();
  });
});
