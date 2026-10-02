import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { highlightMatches } from './services/palette/source';

/**
 * Pins the jsdom / Testing Library behaviours that `test-support/README.md`'s
 * "Porting an e2e spec" traps rest on (Phase 82 Theme C). Each trap there is a
 * false negative that reads as a render or timing bug and is not one; if a
 * dependency bump changes the behaviour underneath, the matching test here
 * goes red and the guidance gets revisited rather than silently going stale.
 */
describe('test-support premises', () => {
  it('ResizeObserver fires on a microtask after observe(), never synchronously', async () => {
    const calls: number[] = [];
    const ro = new ResizeObserver(() => calls.push(calls.length));
    ro.observe(document.body);

    // A synchronous read straight after the interaction that mounted the
    // observer sees nothing yet — the trap a `getBy*` falls into.
    expect(calls).toHaveLength(0);

    await Promise.resolve();
    expect(calls).toHaveLength(1);
    ro.disconnect();
  });

  it('disjoint <mark> highlights keep textContent whole but split the accessible name', () => {
    // "tt" fuzzy-matched against "Toggle Terminal" marks the two Ts apart.
    render(
      <div role="listbox" aria-label="results">
        <div role="option" aria-selected={false}>
          <span>{highlightMatches('Toggle Terminal', [0, 7])}</span>
        </div>
      </div>,
    );

    const [row] = screen.getAllByRole('option');
    expect(row?.textContent).toBe('Toggle Terminal');
    expect(row?.querySelectorAll('mark')).toHaveLength(2);
    // jsdom loads no stylesheet, so accname cannot see that <mark> is inline
    // and pads each one with spaces.
    expect(screen.queryByRole('option', { name: 'Toggle Terminal' })).toBeNull();
    expect(screen.getByRole('option', { name: 'T oggle T erminal' })).toBe(row);
  });

  it('getByText matches the whole string by default, where Playwright matches a substring', () => {
    render(<p>Switched to bilo-io (github)</p>);

    expect(screen.queryByText('Switched to')).toBeNull();
    expect(screen.getByText(/Switched to/)).toBeTruthy();
    expect(screen.getByText('Switched to', { exact: false })).toBeTruthy();
  });

  it('getByRole takes no `exact` option — a verbatim Playwright port is a typecheck error', () => {
    render(<button type="button">Save</button>);

    // @ts-expect-error — `exact` is getByText's option, not ByRoleOptions'.
    const button = within(document.body).getByRole('button', { name: 'Save', exact: true });
    expect(button.textContent).toBe('Save');
  });
});
