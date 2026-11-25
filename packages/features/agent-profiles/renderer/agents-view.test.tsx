// vitest/jsdom: tab roles, keyboard and focus over a mock bridge; no real layout is needed.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentsView } from './agents-view';
import { mockBridge, mountWith } from './test-harness';
import { profileFixture } from './testing';

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('AgentsView', () => {
  it('has three tabs, opens on Your agents and counts the agents', async () => {
    mockBridge([profileFixture({ id: 'profile-a', name: 'Alpha' }), profileFixture({ id: 'profile-b', name: 'Bravo' })]);
    mountWith(<AgentsView />);
    expect(screen.getByRole('tablist', { name: 'Agents' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Your agents', 'Builder', 'Info']);
    expect(screen.getByTestId('agents-tab-list').getAttribute('aria-selected')).toBe('true');
    await screen.findByText('2 agents');
  });

  it('moves between tabs with the arrow keys, Home and End', () => {
    mockBridge([]);
    mountWith(<AgentsView />);
    const list = screen.getByTestId('agents-tab-list');
    list.focus();
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByTestId('agents-tab-builder').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId('agents-tab-builder'));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByTestId('agents-tab-info').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByTestId('agents-tab-list').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(screen.getByTestId('agents-tab-info').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(screen.getByTestId('agents-tab-list').getAttribute('aria-selected')).toBe('true');
  });

  it('Edit on a card selects the Builder with that profile and focuses its name input', async () => {
    mockBridge([profileFixture({ id: 'profile-a', name: 'Alpha' })]);
    mountWith(<AgentsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByTestId('agents-tab-builder').getAttribute('aria-selected')).toBe('true');
    const input = screen.getByTestId('builder-name') as HTMLInputElement;
    expect(input.value).toBe('Alpha');
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('a template opens the Builder on an unsaved draft', async () => {
    mockBridge([]);
    mountWith(<AgentsView />);
    fireEvent.click(await screen.findByTestId('agents-empty-template-builder'));
    expect((screen.getByTestId('builder-name') as HTMLInputElement).value).toBe('Builder');
    expect(screen.getByText(/not saved yet/)).toBeTruthy();
  });

  it('shows the Info tab', () => {
    mockBridge([]);
    mountWith(<AgentsView />);
    fireEvent.click(screen.getByTestId('agents-tab-info'));
    expect(screen.getByTestId('agents-info')).toBeTruthy();
  });

  it('shows a dot on the Builder tab while the draft has unsaved changes, and names it', async () => {
    mockBridge([profileFixture({ id: 'profile-a', name: 'Alpha' })]);
    mountWith(<AgentsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    expect(screen.getByRole('tab', { name: 'Builder' })).toBeTruthy();
    fireEvent.change(screen.getByTestId('builder-name'), { target: { value: 'Beta' } });
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Builder, unsaved changes' })).toBeTruthy());
  });

  it('asks before leaving the Builder with unsaved changes, and stays on Cancel', async () => {
    mockBridge([profileFixture({ id: 'profile-a', name: 'Alpha' })]);
    const { confirm } = mountWith(<AgentsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    fireEvent.change(screen.getByTestId('builder-name'), { target: { value: 'Beta' } });
    await screen.findByRole('tab', { name: 'Builder, unsaved changes' });
    fireEvent.click(screen.getByTestId('agents-tab-info'));
    expect(confirm).toHaveBeenCalledTimes(1);
    const request = confirm.mock.calls[0]![0];
    expect(request).toMatchObject({ title: 'Discard changes to Beta?', confirmLabel: 'Discard', danger: true });
    expect(screen.getByTestId('agents-tab-builder').getAttribute('aria-selected')).toBe('true');
    request.onConfirm();
    await waitFor(() => expect(screen.getByTestId('agents-tab-info').getAttribute('aria-selected')).toBe('true'));
  });

  it('does not ask when nothing changed', async () => {
    mockBridge([profileFixture({ id: 'profile-a', name: 'Alpha' })]);
    const { confirm } = mountWith(<AgentsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Alpha' }));
    fireEvent.click(screen.getByTestId('agents-tab-info'));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByTestId('agents-info')).toBeTruthy();
  });
});
