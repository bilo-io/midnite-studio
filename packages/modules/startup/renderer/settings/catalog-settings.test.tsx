// vitest/jsdom: Settings ▸ Catalog over a mock bridge: add, hide, delete, the in-use refusal, restore, JPY parsing.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildFleetStarter, seedFleetCatalog, type FleetCatalog } from '@midnite/studio-shared';

import { settingsClient, STARTUP_SETTINGS } from '../startup-settings';
import { CATALOG_SAVE_DEBOUNCE_MS } from './catalog-settings';

const Page = STARTUP_SETTINGS.find((p) => p.id === 'app:startup-catalog')!.Page;
const company = (currency: string) => ({ name: 'Acme', currency, address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 0, asOf: '2026-11-01' } });
const custom = { id: 'c-1', label: 'My rig', priceMinor: 1000, watts: 100, builtIn: false, hidden: false };

function install(opts: { currency?: string; withCompany?: boolean; catalog?: FleetCatalog; used?: boolean } = {}) {
  const currency = opts.currency ?? 'USD';
  const catalog = opts.catalog ?? seedFleetCatalog(currency);
  const projection = buildFleetStarter('gpu-cluster', { projectionId: '00000000-0000-4000-8000-000000000001', nodeId: () => crypto.randomUUID() }, '2020-01-01T00:00:00.000Z', 'P');
  if (opts.used) projection.template = { ...projection.template, hardwareId: 'c-1' };
  const workspace = { version: 3, fleetCatalog: catalog, fleetProjections: opts.used ? [projection] : [], company: opts.withCompany === false ? null : company(currency) };
  const upsertFleetCatalog = vi.fn(async () => ({ ok: true, value: {} }));
  window.midniteStudio = {
    startup: { get: vi.fn(async () => ({ ok: true, value: { workspace, revision: 1, readOnly: false } })), upsertFleetCatalog, onChanged: () => () => undefined },
  } as unknown as typeof window.midniteStudio;
  return upsertFleetCatalog;
}
const lastSaved = (fn: ReturnType<typeof vi.fn>): FleetCatalog => (fn.mock.calls.at(-1) as unknown as [{ catalog: FleetCatalog }])[0].catalog;
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(CATALOG_SAVE_DEBOUNCE_MS + 10)));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  settingsClient.clear();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

describe('CatalogPage', () => {
  it('adds a custom hardware row and saves it after the debounce', async () => {
    const save = install();
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add hardware' }));
    expect(save).not.toHaveBeenCalled();
    await settle();
    const saved = lastSaved(save);
    expect(saved.hardware.at(-1)).toMatchObject({ label: 'New hardware', builtIn: false, hidden: false });
    expect(saved.hardware.at(-1)!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hides a built-in and offers no Delete for it', async () => {
    const save = install();
    render(<Page />);
    fireEvent.click(await screen.findByRole('switch', { name: 'Hidden: L40S node' }));
    await settle();
    expect(lastSaved(save).hardware.find((h) => h.id === 'l40s-node')!.hidden).toBe(true);
    expect(screen.queryByRole('button', { name: 'Delete L40S node' })).toBeNull();
  });

  it('deletes an unused custom row', async () => {
    const save = install({ catalog: { ...seedFleetCatalog('USD'), hardware: [...seedFleetCatalog('USD').hardware, custom] } });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete My rig' }));
    await settle();
    expect(lastSaved(save).hardware.some((h) => h.id === 'c-1')).toBe(false);
  });

  it('refuses to delete a custom row a node uses, inline', async () => {
    const save = install({ used: true, catalog: { ...seedFleetCatalog('USD'), hardware: [...seedFleetCatalog('USD').hardware, custom] } });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete My rig' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/In use by 1 node — hide it instead\./);
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Label: My rig')).toBeTruthy();
  });

  it('restore defaults confirms, resets built-ins and keeps custom rows', async () => {
    const seed = seedFleetCatalog('USD');
    const edited = { ...seed, hardware: [...seed.hardware.map((h) => (h.id === 'dual-4090' ? { ...h, priceMinor: 1, hidden: true } : h)), custom] };
    const save = install({ catalog: edited });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore defaults' }));
    expect(save).not.toHaveBeenCalled();
    await act(async () => void fireEvent.click((await screen.findAllByRole('button', { name: 'Restore defaults' })).at(-1)!));
    await settle();
    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = lastSaved(save);
    expect(saved.hardware.find((h) => h.id === 'dual-4090')).toMatchObject({ priceMinor: 650_000, hidden: false });
    expect(saved.hardware.some((h) => h.id === 'c-1')).toBe(true);
  });

  it('parses a JPY price typed as 6500 to 6_500 minor units', async () => {
    const save = install({ currency: 'JPY' });
    render(<Page />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add hardware' }));
    fireEvent.change(screen.getByLabelText('Price: New hardware'), { target: { value: '6500' } });
    await settle();
    expect(lastSaved(save).hardware.at(-1)!.priceMinor).toBe(6_500);
  });
});
