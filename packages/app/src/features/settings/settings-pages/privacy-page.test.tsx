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
