// vitest/jsdom: the tooltip's text and the click handler — no browser capability needed.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createViewLink } from './view-link';

afterEach(cleanup);

describe('createViewLink', () => {
  it('shows the chord, and only the chord, as the tooltip', () => {
    const ViewLink = createViewLink(() => {}, (view) => (view === 'graph' ? '⌘⇧G' : undefined));
    render(<ViewLink href="/graph">Graph</ViewLink>);
    const link = screen.getByRole('link', { name: 'Graph' });
    fireEvent.mouseEnter(link);
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('⌘⇧G');
    expect(link.getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('gives a row with no chord no tooltip at all', () => {
    const ViewLink = createViewLink(() => {}, () => undefined);
    render(<ViewLink href="/notes">Notes</ViewLink>);
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  it('navigates in-app on click and prevents the default', () => {
    const onNavigate = vi.fn();
    const ViewLink = createViewLink(onNavigate, () => undefined);
    render(<ViewLink href="/findings">Findings</ViewLink>);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'Findings' }).dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onNavigate).toHaveBeenCalledWith('findings');
  });

  it('uses an injected tooltip and href mapping (Studio passes its own)', () => {
    const Tip = ({ label, children }: { label: React.ReactNode; children: React.ReactElement }) => (
      <span data-testid="studio-tip" data-label={String(label)}>
        {children}
      </span>
    );
    const onNavigate = vi.fn();
    const ViewLink = createViewLink(onNavigate, () => 'X', { Tooltip: Tip, viewForHref: () => 'landing' });
    render(<ViewLink href="/">Home</ViewLink>);
    expect(screen.getByTestId('studio-tip').dataset.label).toBe('X');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(onNavigate).toHaveBeenCalledWith('landing');
  });
});
