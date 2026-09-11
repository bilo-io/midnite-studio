import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useBrowserStore, type BrowserTab } from '../../store/browser-store';
import { BrowserTabStrip } from './tab-strip';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  portalTarget: null as HTMLDivElement | null,
  leadingTarget: null as HTMLDivElement | null,
  setKeepAwake: vi.fn(),
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole, browser: { setKeepAwake: mocks.setKeepAwake } }),
}));

vi.mock('../../components/detached-window-frame', () => ({
  usePopoutHeaderActions: () => mocks.portalTarget,
  usePopoutHeaderLeading: () => mocks.leadingTarget,
}));

function tab(id: string, title: string): BrowserTab {
  return {
    id,
    kind: 'page',
    url: `https://example.com/${id}`,
    title,
    loading: false,
    canGoBack: false,
    canGoForward: false,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <DialogHost>{children}</DialogHost>
    </QueryClientProvider>
  );
}

const renderStrip = () => render(<BrowserTabStrip />, { wrapper });

beforeEach(() => {
  mocks.windowRole = 'main';
  mocks.portalTarget = null;
  mocks.leadingTarget = null;
  mocks.setKeepAwake.mockClear();
  useBrowserStore.setState({
    tabs: [tab('a', 'First tab'), tab('b', 'Second tab')],
    groups: [],
    activeTabId: 'a',
  });
});

afterEach(cleanup);

describe('BrowserTabStrip', () => {
  it('renders the full docked strip, including the hover-to-detach button', () => {
    renderStrip();

    expect(screen.getByRole('tablist', { name: 'Browser tabs' })).toBeDefined();
    expect(screen.getByLabelText('Detach Browser into its own window')).toBeDefined();
    expect(screen.getByText('First tab')).toBeDefined();
  });

  it('portals the whole strip into the leading slot of the title bar once popped out', () => {
    mocks.windowRole = 'browser';
    const leadingPortal = document.createElement('div');
    document.body.appendChild(leadingPortal);
    mocks.leadingTarget = leadingPortal;

    renderStrip();

    // No strip at the panel's usual spot — it moved to the bar's leading slot.
    expect(screen.queryByLabelText('Detach Browser into its own window')).toBeNull();
    expect(leadingPortal.querySelector('[role="tablist"]')).not.toBeNull();
    expect(leadingPortal.textContent).toContain('First tab');

    leadingPortal.remove();
  });

  it('falls back to actionsTarget when leadingTarget is null', () => {
    mocks.windowRole = 'browser';
    const actionsPortal = document.createElement('div');
    document.body.appendChild(actionsPortal);
    mocks.portalTarget = actionsPortal;
    mocks.leadingTarget = null;

    renderStrip();

    expect(screen.queryByLabelText('Detach Browser into its own window')).toBeNull();
    expect(actionsPortal.querySelector('[role="tablist"]')).not.toBeNull();
    expect(actionsPortal.textContent).toContain('First tab');

    actionsPortal.remove();
  });

  it('falls back to the full docked strip when popped out but no merged frame exists', () => {
    mocks.windowRole = 'browser';
    mocks.portalTarget = null;

    renderStrip();

    expect(screen.getByRole('tablist', { name: 'Browser tabs' })).toBeDefined();
    // Detaching an already-detached window makes no sense — same guard as before.
    expect(screen.queryByLabelText('Detach Browser into its own window')).toBeNull();
    expect(screen.getByText('First tab')).toBeDefined();
  });

  it('the tablist scrolls horizontally with its scrollbar chrome hidden', () => {
    renderStrip();

    const tablist = screen.getByRole('tablist', { name: 'Browser tabs' });
    // Real geometry (does the ellipsis actually engage, is the scrollbar chrome
    // actually invisible) needs a real layout engine, which jsdom has none of —
    // this only asserts the classes that produce that behaviour are present.
    expect(tablist.className).toContain('hide-scrollbar');
    expect(tablist.className).toContain('overflow-x-auto');
  });

  it('a tab shrinks (flex-1, a min-width floor, a max-width ceiling) rather than growing unbounded', () => {
    renderStrip();

    const tab = screen.getByRole('tab', { name: 'First tab' });
    // The floor and ceiling this asserts are documented in tab-strip.tsx's own
    // comment above this className — the floor is sized to fit the active
    // tab's favicon + close button, the ceiling keeps a lone tab from
    // stretching across the whole bar. `min-w-0` on the label span is what
    // lets `truncate`'s ellipsis engage once flex-1 actually shrinks the tab —
    // jsdom computes no widths, so this cannot assert the ellipsis fires, only
    // that the classes which make it possible are applied.
    const tabRow = tab.closest('[class*="min-w-\\[3\\.5rem\\]"]');
    expect(tabRow).not.toBeNull();
    expect(tabRow?.className).toContain('flex-1');
    expect(tabRow?.className).toContain('max-w-[12rem]');
    expect(tab.className).toContain('min-w-0');
    const label = tab.querySelector('span');
    expect(label?.className).toContain('min-w-0');
    expect(label?.className).toContain('truncate');
  });

  it('shows the sleeping glyph on a discarded tab, and only that one (Phase 84 Theme F)', () => {
    useBrowserStore.setState((s) => ({
      tabs: s.tabs.map((t) => (t.id === 'b' ? { ...t, state: 'sleeping' as const } : t)),
    }));

    renderStrip();

    const awakeTab = screen.getByRole('tab', { name: 'First tab' });
    const sleepingTab = screen.getByRole('tab', { name: 'Second tab' });
    expect(awakeTab.closest('div')?.querySelector('[data-tab-sleeping]')).toBeNull();
    expect(sleepingTab.closest('div')?.querySelector('[data-tab-sleeping]')).not.toBeNull();
  });

  it('the context menu offers "Keep awake", and toggling it updates the store and tells main', () => {
    renderStrip();

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'First tab' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keep awake' }));

    expect(useBrowserStore.getState().tabs.find((t) => t.id === 'a')?.keepAwake).toBe(true);
    expect(mocks.setKeepAwake).toHaveBeenCalledWith({ tabId: 'a', keepAwake: true });

    fireEvent.contextMenu(screen.getByRole('tab', { name: 'First tab' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Allow this tab to sleep' }));

    expect(useBrowserStore.getState().tabs.find((t) => t.id === 'a')?.keepAwake).toBe(false);
    expect(mocks.setKeepAwake).toHaveBeenCalledWith({ tabId: 'a', keepAwake: false });
  });
});
