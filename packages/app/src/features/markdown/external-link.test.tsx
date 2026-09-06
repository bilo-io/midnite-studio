import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/** `@testing-library`'s `createEvent` has no built-in `auxclick` — build the native event by hand. */
function auxClick(button: number) {
  return new MouseEvent('auxclick', { bubbles: true, cancelable: true, button });
}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBrowserStore } from '../../store/browser-store';
import { useUiStore } from '../../store/ui-store';

import { ExternalLink } from './external-link';

const openExternal = vi.hoisted(() => vi.fn());
vi.mock('../../services/queries', () => ({ openExternal }));

beforeEach(() => {
  openExternal.mockClear();
  useBrowserStore.setState({ tabs: [], groups: [], activeTabId: null, recentlyClosed: [] });
  useUiStore.setState({ linkTarget: 'in-app', browserOpen: false });
});

afterEach(() => {
  cleanup();
});

describe('ExternalLink', () => {
  it('renders nothing clickable when href is absent', () => {
    render(<ExternalLink>plain text</ExternalLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('plain text')).toBeDefined();
  });

  it('routes a plain click to a browser tab, never openExternal', () => {
    render(<ExternalLink href="https://example.com/pr/1">a pull request</ExternalLink>);
    fireEvent.click(screen.getByRole('link'));

    expect(useBrowserStore.getState().tabs[0]?.url).toBe('https://example.com/pr/1');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('routes a shift-click to the system browser', () => {
    render(<ExternalLink href="https://example.com">a link</ExternalLink>);
    fireEvent.click(screen.getByRole('link'), { shiftKey: true });

    expect(openExternal).toHaveBeenCalledWith('https://example.com');
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });

  it('routes a middle-click into a background tab via onAuxClick', () => {
    const first = useBrowserStore.getState().openTab('https://one.example');
    render(<ExternalLink href="https://two.example">a link</ExternalLink>);
    const link = screen.getByRole('link');
    fireEvent(link, auxClick(1));

    const { tabs, activeTabId } = useBrowserStore.getState();
    expect(tabs).toHaveLength(2);
    expect(activeTabId).toBe(first);
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('never reaches openExternal for a right-click (auxClick with a non-middle button)', () => {
    render(<ExternalLink href="https://example.com">a link</ExternalLink>);
    const link = screen.getByRole('link');
    fireEvent(link, auxClick(2));

    expect(openExternal).not.toHaveBeenCalled();
    expect(useBrowserStore.getState().tabs).toHaveLength(0);
  });
});
