import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import { renderView } from '../../../test-support/render';
import { TitleBarStatus } from './titlebar-status';

/**
 * Migrated from `e2e/titlebar-status-panel.spec.ts` (Phase 82 Theme C, wave
 * 5) — both of the file's original tests: the Time/Date tab default and
 * swap, and the settings drawer scoping its controls to whichever tab is
 * active. Both moved here cleanly; nothing needed real browser behaviour, so
 * `e2e/titlebar-status-panel.spec.ts` is deleted outright.
 *
 * Mounted through `TitleBarStatus` itself — clicking the real pill trigger,
 * not `TitlebarStatusPanel` directly — because that click-to-open wiring
 * (via `Popover`, portalled to `document.body`) is exactly what
 * `titlebar-status.test.tsx`'s existing unit tests (which mount
 * `TitlebarStatusPanel` bare) do not exercise; this file proves the whole
 * assembled bridge, the same split `optimizer-page.bridge.test.tsx` draws
 * against its own component's pre-existing unit coverage. `Popover`'s
 * `createPortal(..., document.body)` needs no special handling here —
 * Testing Library's `screen` queries the whole document by default, portal
 * or not.
 */

function openPanel() {
  renderView(<TitleBarStatus />, { fixtures });
  fireEvent.click(screen.getByTestId('titlebar-status-pill'));
  return screen.getByTestId('titlebar-status-panel');
}

afterEach(cleanup);

describe('TitleBarStatus, assembled through the real bridge', () => {
  it('defaults to Time, and switching to Date swaps the sections', () => {
    const panel = openPanel();

    const timeTab = within(panel).getByTestId('titlebar-status-tab-time');
    const dateTab = within(panel).getByTestId('titlebar-status-tab-date');
    expect(timeTab.getAttribute('aria-selected')).toBe('true');
    expect(within(panel).getByText('Current Time')).toBeTruthy();
    expect(within(panel).getByText('World Clocks')).toBeTruthy();
    expect(within(panel).queryByText('Calendar')).toBeNull();

    fireEvent.click(dateTab);
    expect(dateTab.getAttribute('aria-selected')).toBe('true');
    expect(within(panel).getByText('Calendar')).toBeTruthy();
    expect(within(panel).queryByText('World Clocks')).toBeNull();
  });

  it('the settings drawer scopes to the active tab', () => {
    const panel = openPanel();

    fireEvent.click(within(panel).getByTitle('Configure status bar display & sections'));
    const drawer = within(panel).getByTestId('titlebar-status-config-drawer');

    // Time tab is active by default — its drawer offers Time-only controls.
    expect(within(drawer).getByText('Current Time', { exact: true })).toBeTruthy();
    expect(within(drawer).queryByText('Calendar', { exact: true })).toBeNull();

    fireEvent.click(within(panel).getByTestId('titlebar-status-tab-date'));
    expect(within(drawer).getByText('Calendar', { exact: true })).toBeTruthy();
    expect(within(drawer).queryByText('Current Time', { exact: true })).toBeNull();
  });
});
