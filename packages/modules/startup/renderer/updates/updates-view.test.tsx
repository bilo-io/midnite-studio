// vitest/jsdom: the Updates view over a mock bridge: list order, debounced saves, the draft review card (Accept,
// Discard, Cancel ignoring a late answer), Preview, the email notice, read-only and the company gate.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InvestorUpdate } from '@midnite/studio-shared';

import { StartupPane } from '../startup-pane';
import { lineDiff, lastMonth, monthLabel } from './update-model';

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = { name: 'Acme', currency: 'GBP', address: '', invoicePrefix: 'INV-', paymentTermsDays: 30, openingCash: { minor: 10_000_000, asOf: '2026-11-01' } };
const update = (n: number, period: string, markdown = '', over: Partial<InvestorUpdate> = {}): InvestorUpdate => ({
  id: u(n),
  period,
  title: `Investor update: ${monthLabel(period)}`,
  markdown,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  drafts: [],
  ...over,
});
const snapshot = (investorUpdates: InvestorUpdate[], readOnly = false, withCompany = true) => ({
  ok: true,
  value: { workspace: { version: 4, fleetProjections: [], company: withCompany ? company : null, milestones: [], lines: [], scenarios: [], customers: [], invoices: [], vendors: [], contracts: [], invoiceCounter: 0, ledger: null, investorUpdates }, revision: 0, readOnly },
});

type Ops = Record<string, ReturnType<typeof vi.fn>>;
function install(updates: InvestorUpdate[], over: Ops = {}, readOnly = false, withCompany = true): Ops {
  const ops: Ops = {
    get: vi.fn(async () => snapshot(updates, readOnly, withCompany)),
    upsertInvestorUpdate: vi.fn(async () => ({ ok: true, value: null })),
    removeInvestorUpdate: vi.fn(async () => ({ ok: true, value: null })),
    draftInvestorUpdate: vi.fn(async () => ({ ok: true, value: { markdown: '# Drafted', model: 'claude' } })),
    exportInvestorUpdateMd: vi.fn(async () => ({ ok: true, value: { saved: true } })),
    exportInvestorUpdatePdf: vi.fn(async () => ({ ok: true, value: { saved: true } })),
    emailInvestorUpdate: vi.fn(async () => ({ ok: true, value: { truncated: false } })),
    ...over,
  };
  window.midniteStudio = { startup: { ...ops, onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
  return ops;
}
const renderUpdates = () => render(<StartupPane view="startup.updates" onView={() => undefined} />);
const editor = () => screen.findByLabelText('Update markdown') as Promise<HTMLTextAreaElement>;

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(async () => undefined) }, configurable: true });
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('update-model', () => {
  it('names last month across a year boundary and labels a period', () => {
    expect(lastMonth(new Date('2026-01-03T00:00:00Z'))).toBe('2025-12');
    expect(monthLabel('2026-10')).toBe('October 2026');
  });
  it('diffs lines', () => {
    expect(lineDiff('a\nb', 'a\nc').map((l) => l.kind)).toEqual(['same', 'del', 'add']);
  });
});

describe('UpdatesView', () => {
  it('asks for the company first, like every gated view', async () => {
    install([], {}, false, false);
    renderUpdates();
    expect(await screen.findByText('Set up your company')).toBeTruthy();
  });

  it('shows the empty state, then lists months newest first and opens the newest', async () => {
    install([]);
    const { unmount } = renderUpdates();
    expect(await screen.findByText(/No updates yet/)).toBeTruthy();
    unmount();
    install([update(1, '2026-08', 'old'), update(2, '2026-10', 'newest')]);
    renderUpdates();
    const list = await screen.findByLabelText('Updates by month');
    const months = [...list.querySelectorAll('li button span:first-child')].map((e) => e.textContent);
    expect(months).toEqual(['October 2026', 'August 2026']);
    expect((await editor()).value).toBe('newest');
  });

  it('creates an update for the chosen month and shows main\'s refusal inline', async () => {
    const ops = install([], { upsertInvestorUpdate: vi.fn(async () => ({ ok: false, kind: 'invalid', message: 'There is already an update for 2026-10.' })) });
    renderUpdates();
    fireEvent.click(await screen.findByRole('button', { name: /New update/ }));
    expect((screen.getByLabelText('Month') as HTMLInputElement).value).toBe(lastMonth(new Date()));
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '2026-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('There is already an update for 2026-10.')).toBeTruthy();
    expect(ops.upsertInvestorUpdate).toHaveBeenCalledWith({ update: expect.objectContaining({ period: '2026-10', markdown: '', drafts: [] }) });
  });

  it('saves an edit once, after the debounce', async () => {
    const ops = install([update(1, '2026-10', 'one')]);
    renderUpdates();
    const box = await editor();
    fireEvent.change(box, { target: { value: 'one two' } });
    fireEvent.change(box, { target: { value: 'one two three' } });
    expect(ops.upsertInvestorUpdate).not.toHaveBeenCalled();
    await waitFor(() => expect(ops.upsertInvestorUpdate).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(ops.upsertInvestorUpdate).toHaveBeenCalledWith({ update: expect.objectContaining({ id: u(1), markdown: 'one two three' }) });
  });

  it('Draft with AI shows a review card and saves nothing until Accept', async () => {
    const ops = install([update(1, '2026-10', '')]);
    renderUpdates();
    await editor();
    fireEvent.change(screen.getByLabelText('Notes for the draft'), { target: { value: 'we hired' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
    expect(await screen.findByLabelText('Draft for review')).toBeTruthy();
    expect(ops.draftInvestorUpdate).toHaveBeenCalledWith({ period: '2026-10', notes: 'we hired' });
    expect(ops.upsertInvestorUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(ops.upsertInvestorUpdate).toHaveBeenCalledTimes(1));
    const saved = ops.upsertInvestorUpdate!.mock.calls[0]![0] as { update: InvestorUpdate };
    expect(saved.update.markdown).toBe('# Drafted');
    expect(saved.update.drafts).toHaveLength(1);
    expect(saved.update.drafts[0]!.model).toBe('claude');
    await waitFor(() => expect(screen.queryByLabelText('Draft for review')).toBeNull());
  });

  it('Discard drops the draft without saving', async () => {
    const ops = install([update(1, '2026-10', 'mine')]);
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
    await screen.findByLabelText('Draft for review');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByLabelText('Draft for review')).toBeNull();
    expect(ops.upsertInvestorUpdate).not.toHaveBeenCalled();
  });

  it('Cancel ignores the answer that arrives late', async () => {
    let answer: (v: unknown) => void = () => undefined;
    const ops = install([update(1, '2026-10', '')], { draftInvestorUpdate: vi.fn(() => new Promise((r) => (answer = r))) });
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await act(async () => answer({ ok: true, value: { markdown: 'late', model: 'claude' } }));
    expect(screen.queryByLabelText('Draft for review')).toBeNull();
    expect((screen.getByRole('button', { name: /Draft with AI/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(ops.upsertInvestorUpdate).not.toHaveBeenCalled();
  });

  it('shows a refused draft as an alert', async () => {
    install([update(1, '2026-10', '')], { draftInvestorUpdate: vi.fn(async () => ({ ok: false, kind: 'invalid', message: 'No model is set up.' })) });
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('button', { name: /Draft with AI/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('No model is set up.');
  });

  it('Preview renders the markdown and links do not navigate', async () => {
    install([update(1, '2026-10', '# Hello\n\n- one\n\n[site](https://example.com)')]);
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect((await screen.findByRole('heading', { name: 'Hello' })).tagName).toBe('H1');
    expect(screen.getByText('site').closest('a')).toBeNull();
  });

  it('Copy puts the markdown on the clipboard; Email says when the body was cut', async () => {
    const ops = install([update(1, '2026-10', 'body')], { emailInvestorUpdate: vi.fn(async () => ({ ok: true, value: { truncated: true } })) });
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('button', { name: 'Copy markdown' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('body'));
    fireEvent.click(screen.getByRole('button', { name: 'Email draft' }));
    expect(await screen.findByText(/shortened; the full update is on your clipboard/)).toBeTruthy();
    expect(ops.emailInvestorUpdate).toHaveBeenCalledWith({ id: u(1) });
  });

  it('Save as .md and PDF call their ops', async () => {
    const ops = install([update(1, '2026-10', 'body')]);
    renderUpdates();
    await editor();
    fireEvent.click(screen.getByRole('button', { name: 'Save as .md' }));
    await waitFor(() => expect(ops.exportInvestorUpdateMd).toHaveBeenCalledWith({ id: u(1) }));
    fireEvent.click(screen.getByRole('button', { name: 'Save as PDF' }));
    await waitFor(() => expect(ops.exportInvestorUpdatePdf).toHaveBeenCalledWith({ id: u(1) }));
  });

  it('read-only: every writing control is disabled', async () => {
    install([update(1, '2026-10', 'body')], {}, true);
    renderUpdates();
    expect((await editor()).disabled).toBe(true);
    for (const name of [/New update/, /Draft with AI/, 'Save as .md', 'Save as PDF', 'Email draft', 'Delete update']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled, String(name)).toBe(true);
    }
  });
});
