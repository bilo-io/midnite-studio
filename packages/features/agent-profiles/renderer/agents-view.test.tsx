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
});
