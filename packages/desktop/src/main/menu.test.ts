import { describe, expect, it, vi } from 'vitest';

import type { MenuItemConstructorOptions } from 'electron';

import { buildMenu } from './menu';

/**
 * `menu.ts` imports `electron` for `Menu` alone, and builds its template from
 * the shared keymap. Faking `Menu.buildFromTemplate` to hand the template back
 * is enough to assert the labels and accelerators the user actually sees —
 * following the `vi.mock('electron', …)` pattern `browser-service.test.ts` and
 * `fs-write-handlers.test.ts` already use.
 */
vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => template,
    setApplicationMenu: vi.fn(),
  },
}));

type Item = MenuItemConstructorOptions;

const submenuOf = (label: string): Item[] => {
  const template = buildMenu(() => null) as unknown as Item[];
  const menu = template.find((entry) => entry.label === label);
  return (menu?.submenu ?? []) as Item[];
};

const row = (items: Item[], label: string): Item | undefined =>
  items.find((item) => item.label === label);

describe('the View menu', () => {
  /**
   * Both rows exist to be clicked, and neither carries a native accelerator:
   * an Electron accelerator fires whenever the window is focused, xterm
   * included, which would reload the app out from under the Ctrl+R the
   * renderer deliberately leaves to the shell (`TERMINAL_YIELD_COMMANDS`).
   * Same trade the `repo.close` row already makes.
   */
  it('offers Reload and Hard Reload, with no native accelerator on either', () => {
    const view = submenuOf('View');
    expect(row(view, 'Reload')).toBeDefined();
    expect(row(view, 'Hard Reload')).toBeDefined();
    expect(row(view, 'Reload')?.accelerator).toBeUndefined();
    expect(row(view, 'Hard Reload')?.accelerator).toBeUndefined();
  });

  /**
   * The regression the `labelOf` helper exists to stop: labels used to come
   * from `DEFAULT_KEYMAP`, which drops every chord-free command — so Refresh
   * and Fetch, unbound since the reload pair took their chords, would have
   * rendered as the raw ids `view.refresh` and `sync.fetch`.
   */
  it('keeps a readable label on the now-unbound Refresh, with no accelerator', () => {
    const refresh = row(submenuOf('View'), 'Refresh');
    expect(refresh).toBeDefined();
    expect(refresh?.accelerator).toBeUndefined();
  });

  it('keeps a readable label on the now-unbound Fetch, with no accelerator', () => {
    const fetch = row(submenuOf('Repository'), 'Fetch');
    expect(fetch).toBeDefined();
    expect(fetch?.accelerator).toBeUndefined();
  });
});
