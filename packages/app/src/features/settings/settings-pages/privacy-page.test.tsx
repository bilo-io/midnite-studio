import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { useUiStore } from '../../../store/ui-store';
import { PrivacyPage } from './privacy-page';

function renderPage() {
  return render(
    <FrameChromeProvider chrome={createFrameChrome().chrome}>
      <PrivacyPage />
    </FrameChromeProvider>,
  );
}

describe('PrivacyPage reputation feeds (Phase 117 Theme C)', () => {
  beforeEach(() => {
    useUiStore.setState({ browserReputationFeeds: { urlhaus: false, openphish: false } });
  });
  afterEach(cleanup);

  it('offers one switch per feed, each off by default', () => {
    renderPage();
    expect((screen.getByRole('switch', { name: 'URLhaus (abuse.ch)' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('switch', { name: 'OpenPhish' }) as HTMLInputElement).checked).toBe(false);
  });

  it('turns one feed on without touching the other', () => {
    renderPage();
    fireEvent.click(screen.getByRole('switch', { name: 'OpenPhish' }));
    expect(useUiStore.getState().browserReputationFeeds).toEqual({ urlhaus: false, openphish: true });
  });
});

describe('PrivacyPage local history and agent reads (Phase 115 Themes B + F)', () => {
  beforeEach(() => {
    useUiStore.setState({ historyRetentionDays: null, readAgentHistory: true });
  });
  afterEach(cleanup);

  it('keeps history forever by default and writes the chosen limit as days', () => {
    renderPage();
    const select = screen.getByRole('combobox', { name: 'Keep local history' }) as HTMLSelectElement;
    expect(select.value).toBe('forever');
    fireEvent.change(select, { target: { value: '30' } });
    expect(useUiStore.getState().historyRetentionDays).toBe(30);
    fireEvent.change(select, { target: { value: 'forever' } });
    expect(useUiStore.getState().historyRetentionDays).toBeNull();
  });

  it('names the at-rest protection', () => {
    renderPage();
    expect(screen.getByTestId('at-rest-note').textContent).toMatch(/FileVault/);
  });

  it('offers a Read Claude and Codex history switch, on by default', () => {
    renderPage();
    const sw = screen.getByRole('switch', { name: 'Read Claude and Codex history' }) as HTMLInputElement;
    expect(sw.checked).toBe(true);
    fireEvent.click(sw);
    expect(useUiStore.getState().readAgentHistory).toBe(false);
  });

  it('has a Clear all local history button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Clear all local history/ })).toBeTruthy();
  });
});
