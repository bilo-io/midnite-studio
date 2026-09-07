import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MidniteStudioBridge } from '@midnite/studio-shared';

import { useBrowserStore } from '../../store/browser-store';
import { FindBar } from './find-bar';

function installBridge() {
  const find = vi.fn();
  const findStop = vi.fn();
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    browser: { find, findStop } as unknown as MidniteStudioBridge['browser'],
  } as Partial<MidniteStudioBridge>;
  return { find, findStop };
}

beforeEach(() => {
  useBrowserStore.setState({ activeTabId: 'tab-1', findResult: null });
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('FindBar match count (Phase 32 Theme G)', () => {
  it('renders nothing before a found event answers the query', () => {
    installBridge();
    render(<FindBar onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Find in page...'), { target: { value: 'foo' } });

    expect(screen.queryByText(/\//)).toBeNull();
  });

  it('renders n / m once a found event lands', () => {
    installBridge();
    const { container } = render(<FindBar onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Find in page...'), { target: { value: 'foo' } });
    act(() => useBrowserStore.setState({ findResult: { matches: 4, activeMatchOrdinal: 2 } }));

    expect(container.textContent?.replace(/\s+/g, ' ')).toContain('2 / 4');
  });

  it('renders 0 / 0 for a query with no hits, not an empty slot', () => {
    installBridge();
    const { container } = render(<FindBar onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText('Find in page...'), { target: { value: 'zzz' } });
    act(() => useBrowserStore.setState({ findResult: { matches: 0, activeMatchOrdinal: 0 } }));

    expect(container.textContent?.replace(/\s+/g, ' ')).toContain('0 / 0');
  });

  it('calls findStop and onClose when dismissed', () => {
    const { findStop } = installBridge();
    const onClose = vi.fn();
    render(<FindBar onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Close find bar'));

    expect(findStop).toHaveBeenCalledWith({ tabId: 'tab-1' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
